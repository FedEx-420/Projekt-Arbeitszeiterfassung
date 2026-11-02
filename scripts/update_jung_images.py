"""Extend the public image index with exact JUNG product references.

Only manufacturer sitemap/product pages are read; no private catalogs or accounts.
The source's robots rules and crawl delay apply to every request.
"""
import argparse
import datetime
import gzip
import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

from update_product_images import gtin

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://www.jung-group.com'
UA = 'WorktimeProductIndex/1.0 (+https://github.com/FedEx-420/Projekt-Arbeitszeiterfassung)'


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = {}

    def handle_starttag(self, tag, attrs):
        if tag != 'meta':
            return
        attrs = dict(attrs)
        key = attrs.get('property') or attrs.get('itemprop')
        if key and attrs.get('content'):
            self.values.setdefault(key, []).append(attrs['content'].strip())


def extract(text, url):
    page = urllib.parse.urlsplit(url)
    if page.scheme != 'https' or page.netloc != 'www.jung-group.com' or not page.path.startswith('/de-DE/p/'):
        return None
    parser = Metadata()
    parser.feed(text)
    values = parser.values

    def one(key):
        items = set(values.get(key, []))
        return next(iter(items)) if len(items) == 1 else ''

    title = one('og:title')
    if ' | ' not in title:
        return None
    name, sku = title.rsplit(' | ', 1)
    # The exact variant identifier in the title must agree with the URL.
    if not re.fullmatch(r'[A-Za-z0-9 ._/-]{2,60}', sku) or sku.replace(' ', '-').upper() != urllib.parse.unquote(page.path.rsplit('/', 1)[-1]).upper():
        return None
    code = gtin(one('gtin13'))
    image = urllib.parse.urljoin(ORIGIN, one('og:image'))
    picture = urllib.parse.urlsplit(image)
    if not code or picture.scheme != 'https' or picture.netloc != 'www.jung-group.com' or not re.fullmatch(r'/downloads/catalogue/images/455x455_webp/[A-Za-z0-9_.-]+\.webp', picture.path) or picture.query or picture.fragment:
        return None
    return {'sku': sku, 'brand': 'Jung', 'gtin': code, 'image_url': image,
            'full_name': html.unescape(name).strip(), 'source_url': url}


class Source:
    def __init__(self):
        self.last = 0
        self.delay = 5
        self.robots = None
        self.robots = urllib.robotparser.RobotFileParser()
        self.robots.parse(self.fetch(ORIGIN + '/robots.txt', robots=True).decode().splitlines())
        self.delay = max(5, self.robots.crawl_delay(UA) or 0)

    def fetch(self, url, robots=False):
        if urllib.parse.urlsplit(url).netloc != 'www.jung-group.com':
            raise ValueError('Unexpected source host')
        if not robots and not self.robots.can_fetch(UA, url):
            raise ValueError('Source disallows this URL')
        time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
        self.last = time.monotonic()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity'})
        with urllib.request.urlopen(req, timeout=25) as response:
            if response.geturl() != url:
                raise ValueError('Unexpected redirect')
            data = response.read(12 * 1024 * 1024)
            if len(data) >= 12 * 1024 * 1024:
                raise ValueError('Response too large')
        return data

    def products(self):
        sitemap = ET.fromstring(self.fetch(ORIGIN + '/de-DE/sitemap.xml'))
        maps = [e.text for e in sitemap.iter() if e.tag.endswith('}loc') and e.text]
        urls = []
        for url in maps[:4]:
            data = self.fetch(url)
            if url.endswith('.gz'):
                data = gzip.decompress(data)
                if len(data) > 32 * 1024 * 1024:
                    raise ValueError('Sitemap too large')
            urls.extend(e.text for e in ET.fromstring(data).iter() if e.tag.endswith('}loc') and e.text and e.text.startswith(ORIGIN + '/de-DE/p/'))
        return sorted(set(urls))


def choose(urls, limit):
    common = ['LS-1520-WW', 'LS-1520-SW', 'AS-1520-WW', 'A-1520-WW']
    by_sku = {u.rsplit('/', 1)[-1]: u for u in urls}
    selected = [by_sku[k] for k in common if k in by_sku]
    kinds = ['/SCHUKO-Steckdose-', '/Wippe-', '/Rahmen-', '/Taster-', '/Dimmer-']
    buckets = [[] for _ in range(len(kinds) + 1)]
    for url in urls:
        if url in selected:
            continue
        bucket = next((i for i, kind in enumerate(kinds) if kind in url), len(kinds))
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
    statefile = ROOT / 'catalog-jung-image-state.json'
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
                index['entries']['Jung:' + entry['sku']] = entry
                success += 1
        except Exception:
            # Keep previous verified entries; retry transient errors on the next run.
            continue
    index['updated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    index['source'] = 'Public Hager/Berker/Elcom and JUNG manufacturer catalogs'
    target.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    statefile.write_text(json.dumps(state, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'checked': len(chosen), 'verified_images': success, 'total_images': len(index['entries'])}))


if __name__ == '__main__':
    main()
