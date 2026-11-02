"""Index exact public GIRA product images. Never read private app/catalog data."""
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
ORIGIN = 'https://katalog.gira.de'
UA = 'WorktimeProductIndex/1.0 (+https://github.com/FedEx-420/Projekt-Arbeitszeiterfassung)'


def product_url(url, sku=None):
    p = urllib.parse.urlsplit(url)
    match = re.fullmatch(r'/de-DE/datenblatt/([0-9]{6,9})', p.path)
    return (p.scheme == 'https' and p.netloc == 'katalog.gira.de' and not p.query and not p.fragment
            and bool(match) and (sku is None or match[1] == sku))


def image_url(url, sku=None):
    p = urllib.parse.urlsplit(url)
    match = re.fullmatch(r'/katalog/zoom4/([0-9]{6,9})\.jpg', p.path)
    return (p.scheme == 'https' and p.netloc == 'media.gira.de' and not p.query and not p.fragment
            and bool(match) and (sku is None or match[1] == sku))


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
            if (brand != 'Gira' or not code or not re.fullmatch(r'[0-9]{6,9}', sku)
                    or str(d.get('sku', '')) != sku or not product_url(url, sku) or d.get('url') != url):
                continue
            images = d.get('image')
            images = [images] if isinstance(images, str) else images if isinstance(images, list) else []
            images = list(dict.fromkeys(v for v in images if isinstance(v, str) and image_url(v, sku)))
            if not images:
                continue
            entries.append({'sku': sku, 'brand': 'Gira', 'gtin': code, 'image_url': images[0],
                            'full_name': '', 'source_url': url})
    # Conflicting product blocks must not silently pick one identity/photo.
    unique = {json.dumps(e, sort_keys=True): e for e in entries}
    return next(iter(unique.values())) if len(unique) == 1 else None


class Source:
    def __init__(self):
        self.last = 0
        self.delay = 2
        self.robots = urllib.robotparser.RobotFileParser()
        self.robots.parse(self.fetch(ORIGIN + '/robots.txt', robots=True).decode().splitlines())
        self.delay = max(self.delay, self.robots.crawl_delay(UA) or 0)

    def fetch(self, url, robots=False):
        p = urllib.parse.urlsplit(url)
        if p.scheme != 'https' or p.netloc != 'katalog.gira.de' or p.query or p.fragment:
            raise ValueError('Unexpected source URL')
        if not robots and not self.robots.can_fetch(UA, url):
            raise ValueError('Source disallows URL')
        time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
        self.last = time.monotonic()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity'})
        with urllib.request.urlopen(req, timeout=25) as response:
            if response.geturl() != url:
                raise ValueError('Unexpected source redirect')
            data = response.read(32 * 1024 * 1024)
            if len(data) >= 32 * 1024 * 1024:
                raise ValueError('Response too large')
        return data

    def products(self):
        root = ET.fromstring(self.fetch(ORIGIN + '/sitemap_index.xml'))
        maps = [e.text for e in root.iter() if e.tag.endswith('}loc') and e.text
                and e.text == ORIGIN + '/__sitemap__/de-DE.xml']
        if len(maps) != 1:
            raise ValueError('German product sitemap not confirmed')
        root = ET.fromstring(self.fetch(maps[0]))
        return sorted({e.text for e in root.iter() if e.tag.endswith('}loc') and e.text and product_url(e.text)})


def choose(urls, limit):
    common = ['310600', '010600', '310700', '010700', '015600', '315600', '018803', '018827', '021103', '021303']
    by_sku = {u.rsplit('/', 1)[-1]: u for u in urls}
    selected = [by_sku[k] for k in common if k in by_sku]
    # Spread remaining pages across number families instead of only one color/series.
    buckets = {}
    for url in urls:
        if url not in selected:
            buckets.setdefault(url.rsplit('/', 1)[-1][:2], []).append(url)
    while len(selected) < limit and any(buckets.values()):
        for bucket in buckets.values():
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
    statefile = ROOT / 'catalog-gira-image-state.json'
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
                index['entries']['Gira:' + entry['sku']] = entry
                success += 1
        except Exception:
            continue
    index['updated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    index['source'] = 'Public Hager/Berker/Elcom, JUNG, WAGO and GIRA manufacturer catalogs'
    target.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    statefile.write_text(json.dumps(state, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'checked': len(chosen), 'verified_images': success, 'total_images': len(index['entries'])}))


if __name__ == '__main__':
    main()
