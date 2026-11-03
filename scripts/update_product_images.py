"""Build a public manufacturer image index, never reading private app/catalog data."""
import argparse,concurrent.futures,datetime,hashlib,html,json,re,threading,time,urllib.request,urllib.robotparser,urllib.parse,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
UA='WorktimeProductIndex/1.0 (+https://github.com/FedEx-420/Projekt-Arbeitszeiterfassung)'
ORIGIN='https://hager.com'; SITEMAP=ORIGIN+'/de/katalog/deep/sitemap_de.xml'
# Verified older manufacturer pages can remain useful for existing catalog articles after leaving the current sitemap.
SEED_URLS=['https://hager.com/de/katalog/produkt/3036-wechselschalter-10ax-250v']
lock=threading.Lock(); last_request=0.0
def fetch(url):
 global last_request
 with lock:
  delay=max(0,.6-(time.monotonic()-last_request))
  if delay:time.sleep(delay)
  last_request=time.monotonic()
 request=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'text/html,application/xml;q=0.9','Accept-Encoding':'identity'})
 with urllib.request.urlopen(request,timeout=20) as response:
  if response.geturl().split('/')[2] not in ('hager.com','www.hager.com'):raise ValueError('Unexpected redirect')
  body=response.read(9*1024*1024)
  if len(body)>=9*1024*1024:raise ValueError('Response too large')
  return body.decode('utf-8','replace')
def gtin(value):
 value=str(value or '').strip()
 if len(value) not in (8,12,13,14) or not value.isascii() or not value.isdigit() or not int(value):return None
 total=sum(int(n)*(3 if i%2==0 else 1) for i,n in enumerate(reversed(value[:-1])))
 return value.zfill(14) if (total+int(value[-1]))%10==0 else None
def extract(text,url):
 page=urllib.parse.urlsplit(url)
 if page.scheme!='https' or page.netloc!='hager.com' or page.query or page.fragment or not page.path.startswith('/de/katalog/produkt/'):return None
 products=[]
 for raw in re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',text,re.S|re.I):
  try:
   data=json.loads(raw);values=data if isinstance(data,list) else data.get('@graph',[data]) if isinstance(data,dict) else []
   products.extend(d for d in values if isinstance(d,dict) and d.get('@type')=='Product')
  except ValueError:continue
 refs=set(html.unescape(v).strip() for v in re.findall(r'<span\b[^>]*class=["\']product-commercial-ref["\'][^>]*>\s*([^<]+)</span\s*>',text,re.I))
 eans=set(re.findall(r'class=["\'][^"\']*product attribute ean[^"\']*["\'][\s\S]{0,220}?class=["\']value["\'][^>]*>\s*(\d{8,14})',text,re.I))
 entries=[]
 for d in products:
  internal=str(d.get('sku','')).strip();sku=internal;brand=d.get('brand',{});brand=brand.get('name') if isinstance(brand,dict) else str(brand)
  if not re.fullmatch(r'[A-Za-z0-9-]{3,24}',internal):continue
  if not page.path.lower().split('/produkt/')[-1].startswith(sku.lower()+'-'):
   # Some pages have a separate internal SKU. Use only the explicitly displayed commercial reference,
   # confirmed by this Product's name, the product URL and the page's unique EAN. Never strip SKU suffixes blindly.
   if len(refs)!=1:continue
   commercial=next(iter(refs))
   if (d.get('name')!=commercial or not re.fullmatch(re.escape(commercial)+r'-\d{1,6}',internal)
       or not page.path.lower().split('/produkt/')[-1].startswith(commercial.lower()+'-')):continue
   sku=commercial
  if refs and refs!={sku}:continue
  candidates=d.get('image',[]);candidates=[candidates] if isinstance(candidates,str) else candidates if isinstance(candidates,list) else []
  def safe_image(value):
   if not isinstance(value,str):return False
   p=urllib.parse.urlsplit(value)
   return p.scheme=='https' and p.netloc=='assets.hager.com' and not p.query and not p.fragment and p.path.startswith('/step-content/') and not re.search(r'placeholder|video|logo',value,re.I)
  image=next((v for v in candidates if safe_image(v)),None)
  if not image or brand not in ('Berker','Hager','Elcom'):continue
  structured=d.get('gtin13') or d.get('gtin14') or d.get('gtin');identifier=gtin(structured or (next(iter(eans)) if len(eans)==1 else None))
  if not identifier or (eans and (len(eans)!=1 or gtin(next(iter(eans)))!=identifier)):continue
  name=html.unescape(re.sub('<[^>]+>','',str(d.get('description') or d.get('name') or ''))).replace('\xad','').strip()
  entries.append({'sku':sku,'brand':brand,'gtin':identifier,'image_url':image,'full_name':name if len(name)<=600 and name not in (sku,internal) else '', 'source_url':url})
 unique={json.dumps(e,sort_keys=True):e for e in entries}
 return next(iter(unique.values())) if len(unique)==1 else None


def choose(urls,limit):
 common=['3036','3037','3035','5031','WDE3036','WDE3037','WDE5031','MBN116','MBS116','CDA440D']
 selected=[u for code in common for u in urls if u.rsplit('/produkt/',1)[-1].lower().startswith(code.lower()+'-')]
 selected=list(dict.fromkeys(selected))
 kinds=['wechselschalter','kreuzschalter','taster','rahmen','schuko','leitungsschutz','fi-schutz','ueberspann','verteiler']
 buckets=[[] for _ in range(len(kinds)+1)]
 for url in urls:
  if url not in selected:
   bucket=next((i for i,kind in enumerate(kinds) if kind in url),len(kinds));buckets[bucket].append(url)
 while len(selected)<limit and any(buckets):
  for bucket in buckets:
   if bucket and len(selected)<limit:selected.append(bucket.pop(0))
 return selected[:limit]

def due(url,state,known,now):
 value=state.get(hashlib.sha256(url.encode()).hexdigest()[:20],0)
 # Revisit old unsuccessful parses once after the commercial-reference parser was added.
 if isinstance(value,dict):stamp=value.get('checked_at',0)
 else:stamp=value if url in known else 0
 return now-stamp>30*86400

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=160);args=parser.parse_args()
 if not 1<=args.limit<=300:raise ValueError('Limit must be 1..300')
 target=ROOT/'catalog-image-index.json';statefile=ROOT/'catalog-image-index-state.json'
 index=json.loads(target.read_text(encoding='utf-8')) if target.exists() else {'version':1,'entries':{}}
 state=json.loads(statefile.read_text(encoding='utf-8')) if statefile.exists() else {}
 robots=urllib.robotparser.RobotFileParser();robots.parse(fetch(ORIGIN+'/robots.txt').splitlines())
 sitemap=ET.fromstring(fetch(SITEMAP));urls=[e.text for e in sitemap.iter() if e.tag.endswith('}loc') and e.text and e.text.startswith(ORIGIN+'/de/katalog/produkt/')]
 urls=list(dict.fromkeys(urls+SEED_URLS))
 now=time.time();known={e.get('source_url') for e in index['entries'].values()};eligible=[u for u in urls if due(u,state,known,now) and robots.can_fetch(UA,u)]
 # Finish the first pass before revisiting previously checked product pages.
 unseen=[u for u in eligible if hashlib.sha256(u.encode()).hexdigest()[:20] not in state]
 chosen=choose(sorted(unseen),args.limit)
 if len(chosen)<args.limit:
  chosen+=choose(sorted(set(eligible)-set(chosen)),args.limit-len(chosen))
 success=0
 def load(url):
  try:return url,extract(fetch(url),url),True
  except Exception as e:return url,None,False
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for url,entry,checked in pool.map(load,chosen):
   if checked:state[hashlib.sha256(url.encode()).hexdigest()[:20]]={'checked_at':now,'extractor':960}
   if entry:
    entry['checked_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();index['entries'][entry['brand']+':'+entry['sku']]=entry;success+=1
 index['updated_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();index['source']='Public Hager/Berker/Elcom, JUNG, WAGO, Gira and DEHN manufacturer catalogs'
 target.write_text(json.dumps(index,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
 statefile.write_text(json.dumps(state,separators=(',',':'))+'\n',encoding='utf-8')
 print(json.dumps({'checked':len(chosen),'verified_images':success,'total_images':len(index['entries'])}))
if __name__=='__main__':main()
