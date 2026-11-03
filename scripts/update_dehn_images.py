"""Collect exact product photos from public German DEHN catalogue pages."""
import argparse
import datetime
import json
import re
import time
import urllib.request
import urllib.robotparser

from update_product_images import ROOT, UA, gtin

ORIGIN = 'https://www.dehn.de'
STORE = ORIGIN + '/de-DE'
PHOTO = re.compile(r'https://dxeifbnwdc27t\.cloudfront\.net/image/868612809735/image_[a-z0-9]+')
CATEGORY = re.compile(r'/store/c/[0-9]+(?:/[a-z0-9-]+)?')
FAMILY = re.compile(r'/store/f/[0-9]+/[a-z0-9-]+')
SEEDS = ['/store/c/295183', '/store/c/295333', '/store/c/295383', '/store/c/295691']


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.geturl() != url:
            raise ValueError('Unexpected redirect')
        return response.read(12 * 1024 * 1024).decode('utf-8')


def extract(page, source):
    payload = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
    if not payload:
        return {}
    data = json.loads(payload[1])
    articles = set(re.findall(r'\bid="([0-9]{6})"', page))
    matches = {}
    for record in data:
        if not isinstance(record, dict) or not {'articleNumber', 'gtin', 'assets', 'images'} <= record.keys():
            continue
        sku = data[record['articleNumber']]
        code = gtin(data[record['gtin']])
        if sku not in articles or not code:
            continue
        for ref in data[record['assets']]:
            asset = data[ref]
            if data[asset['category']] != 'FINE_IMG':
                continue
            if not re.fullmatch(re.escape(sku) + r'\.(tif|tiff|jpg|jpeg|png)', data[asset['fileName']], re.I):
                continue
            image = data[asset['url']]
            if PHOTO.fullmatch(image):
                matches.setdefault(sku, set()).add((code, image))
    return {
        sku: dict(sku=sku, brand='DEHN', gtin=code, full_name='',
                  image_url=image + '/-Fjpeg,-S320x320', source_url=source + '#' + sku)
        for sku, variants in matches.items() if len(variants) == 1
        for code, image in variants
    }


def reachable(url):
    try:
        request = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(request, timeout=12) as response:
            return (response.geturl() == url and response.headers.get_content_type() in ('image/png', 'image/jpeg')
                    and response.read(8).startswith((b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff')))
    except OSError:
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, choices=range(1, 101), default=30)
    limit = parser.parse_args().limit
    statefile = ROOT / 'catalog-dehn-image-state.json'
    state = json.loads(statefile.read_bytes()) if statefile.exists() else {}
    visited = set(state.get('visited', []))
    previous_visited = len(visited)
    pending = list(dict.fromkeys(state.get('pending', SEEDS)))
    robots = urllib.robotparser.RobotFileParser()
    robots.parse(fetch(ORIGIN + '/robots.txt').splitlines())
    found = {}
    conflicts = set()
    checked = 0
    retry = []
    for _ in range(limit):
        if not pending:
            break
        path = pending.pop(0)
        family = FAMILY.fullmatch(path)
        if path in visited or not (family or CATEGORY.fullmatch(path)):
            continue
        source = STORE + path
        if not robots.can_fetch(UA, source):
            continue
        time.sleep(.6)
        try:
            page = fetch(source)
            articles = extract(page, source) if family else {}
            if not family:
                links = sorted(set(CATEGORY.findall(page) + FAMILY.findall(page)) - visited - set(pending) - {path})
                pending.extend(links)
        except (OSError, ValueError, IndexError, KeyError, TypeError) as error:
            print(path, type(error).__name__)
            retry.append(path)
            continue
        visited.add(path)
        checked += 1
        for sku, entry in articles.items():
            previous = found.setdefault(sku, entry)
            if (previous['gtin'], previous['image_url']) != (entry['gtin'], entry['image_url']):
                conflicts.add(sku)
    target = ROOT / 'catalog-image-index.json'
    index = json.loads(target.read_bytes())
    new = 0
    for sku, entry in found.items():
        if sku in conflicts or 'DEHN:' + sku in index['entries']:
            continue
        if not reachable(entry['image_url']):
            path = entry['source_url'].split('#', 1)[0].removeprefix(STORE)
            visited.discard(path)
            if path not in retry:
                retry.append(path)
            continue
        entry['checked_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        index['entries']['DEHN:' + sku] = entry
        new += 1
    if new:
        index['updated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        index['source'] = 'Public Hager/Berker/Elcom, JUNG, WAGO, Gira and DEHN manufacturer catalogs'
        target.write_bytes((json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n').encode())
    statefile.write_bytes((json.dumps({'visited': sorted(visited), 'pending': pending + retry},
                                      separators=(',', ':')) + '\n').encode())
    print(json.dumps({'checked': checked, 'completed': len(visited) - previous_visited, 'pending': len(pending) + len(retry), 'matched': len(found), 'added': new}))


if __name__ == '__main__':
    main()
