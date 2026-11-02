"""Isolated manufacturer metadata fixtures; no network requests."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from update_jung_images import extract


class ExactImages(unittest.TestCase):
    url = 'https://www.jung-group.com/de-DE/p/SCHUKO-Steckdose/LS-1520-WW'
    page = '''<meta property="og:title" content="SCHUKO-Steckdose | LS 1520 WW">
    <meta itemprop="gtin13" content="4011377062917">
    <meta property="og:image" content="/downloads/catalogue/images/455x455_webp/JUNG_LS1520WW.webp">'''

    def test_exact_identity(self):
        row = extract(self.page, self.url)
        self.assertEqual(row['sku'], 'LS 1520 WW')
        self.assertEqual(row['gtin'], '04011377062917')
        self.assertEqual(row['brand'], 'Jung')

    def test_wrong_variant_and_gtin(self):
        self.assertIsNone(extract(self.page, self.url.replace('-WW', '-SW')))
        self.assertIsNone(extract(self.page.replace('4011377062917', '4011377062918'), self.url))

    def test_untrusted_picture_and_conflicting_metadata(self):
        self.assertIsNone(extract(self.page.replace('/downloads/catalogue/images/455x455_webp/JUNG_LS1520WW.webp', 'https://other.example/image.webp'), self.url))
        self.assertIsNone(extract(self.page + '<meta itemprop="gtin13" content="4011334233008">', self.url))
        self.assertIsNone(extract(self.page, self.url.replace('www.jung-group.com', 'other.example')))


if __name__ == '__main__':
    unittest.main()
