"""Associate exact public manufacturer models with German catalog and EU declaration.

No private catalog is read. This is evidence of the manufacturer's documentation,
not an independent certification or permission for every installation/application.
"""
import argparse,datetime,hashlib,io,json,re,urllib.request,urllib.robotparser
from pathlib import Path
from pypdf import PdfReader
from update_product_images import ROOT,fetch,extract,UA

def declaration(text,sku):
    if not re.search(r'EU[\s\-]*(?:DECLARATION\s+OF\s+CONFORMITY|KONFORMIT)',text,re.I):return False
    # The exact model must be a table row, never a substring or a linked family.
    return bool(re.search(r'(?m)^\s*'+re.escape(sku)+r'(?=\s|$)',text))

def safety_scope(text):
    # RoHS or a generic CE mention alone cannot establish electrical safety.
    if not re.search(r'(?:2014\s*/\s*35\s*/\s*EU|2014\s*/\s*53\s*/\s*EU)',text,re.I):return False
    return bool(re.search(r'\b(?:EN|IEC)\s*(?:IEC\s*)?\d{4,5}(?:[-:]\d+)?',text))

def documents(page):
    return list(dict.fromkeys(re.findall(r'<a\b(?=[^>]*data-dlcat-code="ProductECDeclaration")(?=[^>]*href="(https://assets\.hager\.com/step-content/[^"<>]+\.pdf)")[^>]*>',page,re.I)))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=80);args=parser.parse_args()
    if not 1<=args.limit<=300:raise ValueError('Limit must be 1..300')
    source=json.loads((ROOT/'catalog-image-index.json').read_text(encoding='utf-8'))
    target=ROOT/'catalog-de-evidence.json';statefile=ROOT/'catalog-de-evidence-state.json'
    index=json.loads(target.read_text(encoding='utf-8')) if target.exists() else {'version':1,'entries':{}}
    state=json.loads(statefile.read_text(encoding='utf-8')) if statefile.exists() else {}
    now=datetime.datetime.now(datetime.timezone.utc);stamp=now.isoformat();cache={};checked=0;accepted=0
    robots=urllib.robotparser.RobotFileParser();robots.parse(fetch('https://hager.com/robots.txt').splitlines())
    values=sorted(source['entries'].values(),key=lambda e:state.get(e['source_url'],''))
    for old in values:
        if checked>=args.limit:break
        if not old.get('gtin') or not old['source_url'].startswith('https://hager.com/de/katalog/produkt/') or not robots.can_fetch(UA,old['source_url']):continue
        last=state.get(old['source_url']);
        if last and index.get('policy_version')==936 and (now-datetime.datetime.fromisoformat(last)).total_seconds()<30*86400:continue
        checked+=1;k=old['brand']+':'+old['sku']
        try:
            page=fetch(old['source_url']);current=extract(page,old['source_url'])
            if not current or current['gtin']!=old['gtin'] or current['brand']!=old['brand'] or current['sku']!=old['sku']:raise ValueError('Product identity changed')
            found=False
            for url in documents(page):
                if url not in cache:
                    request=urllib.request.Request(url,headers={'User-Agent':UA})
                    with urllib.request.urlopen(request,timeout=25) as response:
                        if response.geturl().split('/')[2]!='assets.hager.com':raise ValueError('Unexpected document host')
                        body=response.read(8*1024*1024)
                    if len(body)>=8*1024*1024 or not body.startswith(b'%PDF-'):raise ValueError('Invalid or oversized PDF')
                    reader=PdfReader(io.BytesIO(body))
                    if len(reader.pages)>100:raise ValueError('Document too long')
                    cache[url]=('\n'.join(p.extract_text() or '' for p in reader.pages),hashlib.sha256(body).hexdigest())
                text,digest=cache[url]
                if declaration(text,current['sku']) and safety_scope(text):
                    index['entries'][k]={**current,'market':'DE','document_scope':'electrical-safety','evidence_type':'manufacturer-eu-declaration','type_reference':current['sku'],'document_url':url,'document_sha256':digest,'checked_at':stamp};accepted+=1;found=True;break
            if not found:index['entries'].pop(k,None)
            state[old['source_url']]=stamp
        except Exception as error:print(json.dumps({'sku':old['sku'],'error':str(error)}),flush=True)
        if checked%10==0:print(json.dumps({'checked':checked,'accepted':accepted}),flush=True)
    index['policy_version']=936;index['updated_at']=stamp;index['basis']='Exact manufacturer model in German catalog and linked EU declaration; no independent certification; installation conditions still apply.'
    # Evidence expires even if a source stops responding. Client also enforces expiry.
    index['entries']={k:v for k,v in index['entries'].items() if v.get('document_scope')=='electrical-safety' and (now-datetime.datetime.fromisoformat(v['checked_at'])).total_seconds()<90*86400}
    target.write_text(json.dumps(index,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    statefile.write_text(json.dumps(state,separators=(',',':'))+'\n',encoding='utf-8')
    print(json.dumps({'checked':checked,'accepted':accepted,'total':len(index['entries'])}),flush=True)
if __name__=='__main__':main()
