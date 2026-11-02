"""Index exact public WAGO product images. Never read private app/catalog data."""
import argparse
import datetime
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from pathlib import Path

from update_product_images import gtin

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://www.wago.com'
UA = 'WorktimeProductIndex/1.0 (+https://github.com/FedEx-420/Projekt-Arbeitszeiterfassung)'


def product_url(url, sku=None):
    p = urllib.parse.urlsplit(url)
    return (p.scheme == 'https' and p.netloc == 'www.wago.com' and not p.query and not p.fragment
            and p.path.startswith('/de/') and '/p/' in p.path
            and (sku is None or urllib.parse.unquote(p.path.rsplit('/p/', 1)[1]) == sku))


def image_url(url):
    p = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qs(p.query, keep_blank_values=True)
    return (p.scheme == 'https' and p.netloc == 'www.wago.com' and not p.fragment
            and re.fullmatch(r'/medias/[A-Za-z0-9_.-]+\.(jpg|png|webp)', p.path)
            and len(url) <= 2000 and (not query or (list(query) == ['context'] and len(query['context']) == 1
            and re.fullmatch(r'[A-Za-z0-9_+/=-]{1,1500}', query['context'][0]))))


def extract(text, url):
    if not product_url(url):
        return None
    entries = []
    for raw in re.findall(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', text, re.S | re.I):
        try:
            data = json.loads(raw)
        except ValueError:
            continue
        values = data if isinstance(data, list) else data.get('@graph', [data]) if isinstance(data, dict) else []
        for d in values:
            if not isinstance(d, dict) or d.get('@type') != 'Product':
                continue
            sku = str(d.get('mpn') or '').strip()
            brand = d.get('brand')
            brand = brand.get('name') if isinstance(brand, dict) else brand
            code = gtin(d.get('gtin13') or d.get('gtin14'))
            if (brand != 'WAGO' or not code or not re.fullmatch(r'[0-9]{3,4}-[0-9]{1,8}(?:/[0-9]{1,8})?', sku)
                    or str(d.get('sku', '')) != sku or not product_url(url, sku) or d.get('url') != url):
                continue
            images = d.get('image')
            images = [images] if isinstance(images, str) else images if isinstance(images, list) else []
            images = list(dict.fromkeys(v for v in images if isinstance(v, str) and image_url(v)))
            if not images:
                continue
            entries.append({'sku': sku, 'brand': 'Wago', 'gtin': code, 'image_url': images[0],
                            'full_name': '', 'source_url': url})
    # Conflicting product blocks must not silently pick one identity/photo.
    unique = {json.dumps(e, sort_keys=True): e for e in entries}
    return next(iter(unique.values())) if len(unique) == 1 else None


class Source:
    def __init__(self):
        self.last = 0
        self.delay = 1.5
        self.robots = urllib.robotparser.RobotFileParser()
        self.robots.parse(self.fetch(ORIGIN + '/robots.txt', robots=True).decode().splitlines())
        self.delay = max(self.delay, self.robots.crawl_delay(UA) or 0)

    def fetch(self, url, robots=False):
        p = urllib.parse.urlsplit(url)
        if p.scheme != 'https' or p.netloc != 'www.wago.com' or p.query or p.fragment:
            raise ValueError('Unexpected source URL')
        if not robots and not self.robots.can_fetch(UA, url):
            raise ValueError('Source disallows URL')
        time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
        self.last = time.monotonic()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity'})
        with urllib.request.urlopen(req, timeout=25) as response:
            if response.geturl() != url:
                raise ValueError('Unexpected source redirect')
            data = response.read(24 * 1024 * 1024)
            if len(data) >= 24 * 1024 * 1024:
                raise ValueError('Response too large')
        return data

    def products(self):
        # This product sitemap is linked by /de/sitemap.xml -> commerce-sitemap.xml.
        data = self.fetch(ORIGIN + '/de/sitemaps/Product-de-EUR-de-wago.xml')
        root = ET.fromstring(data)
        return sorted({e.text for e in root.iter() if e.tag.endswith('}loc') and e.text and product_url(e.text)})


def choose(urls, limit):
    common = ['221-412', '221-413', '221-415', '221-2411', '2273-202', '2273-203', '2273-205', '224-101', '222-412']
    by_sku = {u.rsplit('/p/', 1)[-1]: u for u in urls}
    selected = [by_sku[k] for k in common if k in by_sku]
    families = ['221-', '2273-', '224-', '222-', '2002-', '750-']
    buckets = [[] for _ in range(len(families) + 1)]
    for url in urls:
        if url in selected:
            continue
        sku = url.rsplit('/p/', 1)[-1]
        bucket = next((i for i, prefix in enumerate(families) if sku.startswith(prefix)), len(families))
        buckets[bucket].append(url)
    while len(selected) < limit and any(buckets):
        for bucket in buckets:
            if bucket and len(selected) < limit:
                selected.append(bucket.pop(0))
    return selected[:limit]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=40)
    args = parser.parse_args()
    if not 1 <= args.limit <= 120:
        raise ValueError('Limit must be 1..120')
    target = ROOT / 'catalog-image-index.json'
    statefile = ROOT / 'catalog-wago-image-state.json'
    index = json.loads(target.read_text(encoding='utf-8'))
    state = json.loads(statefile.read_text(encoding='utf-8')) if statefile.exists() else {}
    source = Source()
    now = time.time()
    urls = [u for u in source.products() if now - state.get(hashlib.sha256(u.encode()).hexdigest()[:20], 0) > 30 * 86400]
    chosen = choose(urls, args.limit)
    success = 0
    for url in chosen:
        try:
            entry = extract(source.fetch(url).decode('utf-8'), url)
            state[hashlib.sha256(url.encode()).hexdigest()[:20]] = now
            if entry:
                entry['checked_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                index['entries']['Wago:' + entry['sku']] = entry
                success += 1
        except Exception:
            continue
    index['updated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    index['source'] = 'Public Hager/Berker/Elcom, JUNG and WAGO manufacturer catalogs'
    target.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    statefile.write_text(json.dumps(state, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'checked': len(chosen), 'verified_images': success, 'total_images': len(index['entries'])}))


if __name__ == '__main__':
    main()
