"""Build a public manufacturer image index, never reading private app/catalog data."""
import argparse,concurrent.futures,datetime,hashlib,html,json,re,threading,time,urllib.request,urllib.robotparser,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
UA='WorktimeProductIndex/1.0 (+https://github.com/FedEx-420/Projekt-Arbeitszeiterfassung)'
ORIGIN='https://hager.com'; SITEMAP=ORIGIN+'/de/katalog/deep/sitemap_de.xml'
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
 products=[]
 for raw in re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',text,re.S|re.I):
  try:
   data=json.loads(raw); values=data if isinstance(data,list) else data.get('@graph',[data])
   products.extend(d for d in values if isinstance(d,dict) and d.get('@type')=='Product')
  except (ValueError,AttributeError):continue
 for d in products:
  sku=str(d.get('sku','')).strip();brand=d.get('brand',{});brand=brand.get('name') if isinstance(brand,dict) else str(brand)
  if not re.fullmatch(r'[A-Za-z0-9-]{3,24}',sku) or not url.lower().split('/produkt/')[-1].startswith(sku.lower()+'-'):continue
  candidates=d.get('image',[]);candidates=[candidates] if isinstance(candidates,str) else candidates
  image=next((v for v in candidates if isinstance(v,str) and v.startswith('https://assets.hager.com/') and not re.search(r'placeholder|video|logo',v,re.I)),None)
  if not image or brand not in ('Berker','Hager','Elcom'):continue
  ean=re.search(r'class=["\'][^"\']*product attribute ean[^"\']*["\'][\s\S]{0,220}?class=["\']value["\'][^>]*>\s*(\d{8,14})',text,re.I)
  identifier=gtin(d.get('gtin13') or d.get('gtin14') or d.get('gtin') or (ean.group(1) if ean else None))
  name=html.unescape(re.sub('<[^>]+>','',str(d.get('description') or d.get('name') or ''))).replace('\xad','').strip()
  return {'sku':sku,'brand':brand,'gtin':identifier,'image_url':image,'full_name':name if len(name)<=600 and name!=sku else '', 'source_url':url}
 return None
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=160);args=parser.parse_args()
 if not 1<=args.limit<=300:raise ValueError('Limit must be 1..300')
 target=ROOT/'catalog-image-index.json';statefile=ROOT/'catalog-image-index-state.json'
 index=json.loads(target.read_text(encoding='utf-8')) if target.exists() else {'version':1,'entries':{}}
 state=json.loads(statefile.read_text(encoding='utf-8')) if statefile.exists() else {}
 robots=urllib.robotparser.RobotFileParser();robots.parse(fetch(ORIGIN+'/robots.txt').splitlines())
 sitemap=ET.fromstring(fetch(SITEMAP));urls=[e.text for e in sitemap.iter() if e.tag.endswith('}loc') and e.text and e.text.startswith(ORIGIN+'/de/katalog/produkt/')]
 now=time.time();eligible=[u for u in urls if now-state.get(hashlib.sha256(u.encode()).hexdigest()[:20],0)>30*86400 and robots.can_fetch(UA,u)]
 eligible.sort(key=lambda u:(0 if 'schuko' in u and any(s in u for s in ('s-1','s1','b-x','q-3')) else 1 if 'schuko' in u else 2 if 'steckd' in u else 3,u))
 chosen=eligible[:args.limit];success=0
 def load(url):
  try:return url,extract(fetch(url),url),True
  except Exception as e:return url,None,False
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for url,entry,checked in pool.map(load,chosen):
   if checked:state[hashlib.sha256(url.encode()).hexdigest()[:20]]=now
   if entry:
    entry['checked_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();index['entries'][entry['brand']+':'+entry['sku']]=entry;success+=1
 index['updated_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();index['source']='Public Hager/Berker manufacturer catalog'
 target.write_text(json.dumps(index,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
 statefile.write_text(json.dumps(state,separators=(',',':'))+'\n',encoding='utf-8')
 print(json.dumps({'checked':len(chosen),'verified_images':success,'total_images':len(index['entries'])}))
if __name__=='__main__':main()
