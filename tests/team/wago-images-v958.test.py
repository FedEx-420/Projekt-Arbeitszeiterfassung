import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from update_wago_images import extract, choose, image_url
from update_jung_images import choose as choose_jung


class ManufacturerPictures(unittest.TestCase):
    url = 'https://www.wago.com/de/installationsklemmen/verbindungsklemme-mit-hebeln/p/221-412'
    image = 'https://www.wago.com/medias/200-fixture-DE.jpg?context=cHVibGlj'

    def page(self, **patch):
        d = {'@type': 'Product', 'brand': {'name': 'WAGO'}, 'mpn': '221-412',
             'sku': '221-412', 'gtin13': '4050821808435', 'image': self.image, 'url': self.url}
        d.update(patch)
        return '<script type="application/ld+json">' + json.dumps(d) + '</script>'

    def test_exact_public_product(self):
        row = extract(self.page(), self.url)
        self.assertEqual(row['gtin'], '04050821808435')
        self.assertEqual(row['sku'], '221-412')
        self.assertEqual(row['brand'], 'Wago')
        self.assertEqual(row['image_url'], self.image)

    def test_identity_disagreement(self):
        for patch in [{'sku': 'OTHER'}, {'mpn': '221-413'}, {'gtin13': '4050821808436'},
                      {'url': self.url + '0'}, {'brand': {'name': 'Other'}}]:
            self.assertIsNone(extract(self.page(**patch), self.url))
        self.assertIsNone(extract(self.page(), self.url.replace('/221-412', '/221-413')))
        self.assertIsNone(extract(self.page() + self.page(image=self.image.replace('fixture', 'different')), self.url))

    def test_safe_image_queries(self):
        for image in [self.image.replace('www.wago.com', 'other.example'), self.image + '&customer=private',
                      self.image + '&context=duplicate', self.image + '#fragment',
                      self.image.replace('/medias/', '/other/'), self.image.replace('https://', 'http://')]:
            self.assertFalse(image_url(image))
            self.assertIsNone(extract(self.page(image=image), self.url))

    def test_collection_covers_multiple_families(self):
        urls = [f'https://www.wago.com/de/products/p/{family}{i}' for family in ['221-', '2273-', '224-', '222-', '2002-', '750-'] for i in range(1, 8)]
        urls += [self.url]
        chosen = choose(urls, 14)
        self.assertEqual(chosen[0], self.url)
        self.assertEqual(len(set(chosen)), 14)
        self.assertTrue(all(any('/p/' + family in u for u in chosen) for family in ['221-', '2273-', '224-', '222-', '2002-', '750-']))
        jung = ['https://www.jung-group.com/de-DE/p/SCHUKO-Steckdose/LS-1520-WW']
        jung += [f'https://www.jung-group.com/de-DE/p/{kind}-Beispiel/{i}-{kind}' for kind in ['SCHUKO-Steckdose', 'Wippe', 'Rahmen', 'Taster', 'Dimmer'] for i in range(8)]
        selected = choose_jung(jung, 7)
        self.assertEqual(selected[0], jung[0])
        self.assertTrue(all(any('/' + kind + '-' in u for u in selected) for kind in ['Wippe', 'Rahmen', 'Taster', 'Dimmer']))


if __name__ == '__main__':
    unittest.main()
