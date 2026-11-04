"""Exact public manufacturer identity fixtures; never access real accounts or network."""
import copy
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import update_gira_images as gira
import update_product_images as hager


class GiraImages(unittest.TestCase):
    url = 'https://katalog.gira.de/de-DE/datenblatt/010600'
    item = {'@type':'Product','brand':{'name':'Gira'},'mpn':'010600','sku':'010600',
            'gtin13':'4010337106005','url':url,'image':'https://media.gira.de/katalog/zoom4/010600.jpg'}

    def page(self, *items):
        return '<script type="application/ld+json">'+json.dumps({'@graph':list(items)})+'</script>'

    def test_exact(self):
        row=gira.extract(self.page(self.item),self.url)
        self.assertEqual(row['sku'],'010600')
        self.assertEqual(row['gtin'],'04010337106005')
        self.assertEqual(row['full_name'],'')
        self.assertIsNone(gira.extract(self.page({'@type':'Product','isSimilarTo':self.item}),self.url))

    def test_wrong_or_ambiguous(self):
        for patch in [{'mpn':'010700'},{'sku':'10600'},{'brand':{'name':'Other'}},{'gtin13':'4010337106006'},
                      {'url':self.url+'?account=private'},{'image':'https://media.gira.de/katalog/zoom4/010700.jpg'},
                      {'image':'https://media.gira.de/katalog/zoom4/010600.jpg?token=no'},
                      {'image':'https://other.example/katalog/zoom4/010600.jpg'}]:
            self.assertIsNone(gira.extract(self.page({**self.item,**patch}),self.url),str(patch))
        self.assertIsNone(gira.extract(self.page(self.item,{**self.item,'gtin13':'4006381333931'}),self.url))
        self.assertEqual(gira.extract(self.page(self.item,self.item),self.url)['sku'],'010600')
        self.assertIsNone(gira.extract(self.page(self.item),self.url.replace('/de-DE/','/de-AT/')))

    def test_priorities(self):
        urls=[self.url,'https://katalog.gira.de/de-DE/datenblatt/310600','https://katalog.gira.de/de-DE/datenblatt/990001','https://katalog.gira.de/de-DE/datenblatt/880001']
        chosen=gira.choose(sorted(urls),3)
        self.assertEqual(chosen[0],urls[1])
        self.assertEqual(len(set(chosen)),3)


class HagerCommercialReference(unittest.TestCase):
    url='https://hager.com/de/katalog/produkt/3036-wechselschalter-10ax-250v'
    item={'@type':'Product','sku':'3036-05','name':'3036','brand':{'name':'Berker'},'image':['https://assets.hager.com/step-content/P/HA_FIXTURE/11/std.lang.all/3036.webp']}

    def page(self,item=None,ref='3036',ean='4011334023388'):
        return ('<span class="product-commercial-ref">'+ref+'</span><div class="product attribute ean"><div class="value">'+ean+'</div></div><script type="application/ld+json">'+json.dumps(item or self.item)+'</script>')

    def test_explicit_reference(self):
        row=hager.extract(self.page(),self.url)
        self.assertEqual(row['sku'],'3036')
        self.assertEqual(row['gtin'],'04011334023388')
        self.assertEqual(hager.extract(self.page(self.item|{'sku':'3036'}),self.url)['sku'],'3036')

    def test_explicit_numeric_internal_suffix(self):
        url='https://hager.com/de/katalog/produkt/hmw631nr-leistungschalter'
        item=self.item|{'sku':'HMW631NR20','name':'HMW631NR','brand':{'name':'Hager'}}
        row=hager.extract(self.page(item,ref='HMW631NR',ean='3250613197544'),url)
        self.assertEqual(row['sku'],'HMW631NR')
        self.assertEqual(row['gtin'],'03250613197544')
        self.assertIsNone(hager.extract(self.page(item|{'name':'HMW630NR'},ref='HMW631NR',ean='3250613197544'),url))
        self.assertIsNone(hager.extract(self.page(item,ref='HMW631NR',ean='3250613197545'),url))
        self.assertIsNone(hager.extract(self.page(item,ref='HMW630NR',ean='3250613197544'),url))

    def test_no_suffix_guess(self):
        for text in [self.page(ref='3037'),self.page().replace('product-commercial-ref','other'),
                     self.page(self.item|{'name':'Other'}),self.page(ean='4011334023389'),
                     self.page(self.item|{'gtin13':'4006381333931'}),
                     self.page()+ '<span class="product-commercial-ref">3037</span>',
                     self.page(self.item|{'image':['https://assets.hager.com/step-content/P/image.webp?private=yes']})]:
            self.assertIsNone(hager.extract(text,self.url))
        self.assertIsNone(hager.extract(self.page(),self.url.replace('hager.com','other.example')))
        changed=self.item|{'gtin13':'4006381333931'}
        self.assertIsNone(hager.extract(self.page()+self.page(changed,ean='4006381333931'),self.url))

    def test_retry_previously_unparsed_reference(self):
        import hashlib
        key=hashlib.sha256(self.url.encode()).hexdigest()[:20]
        now=4000000
        self.assertTrue(hager.due(self.url,{key:now-10},set(),now))
        self.assertFalse(hager.due(self.url,{key:now-10},{self.url},now))
        self.assertTrue(hager.due(self.url,{key:{'checked_at':now-10,'extractor':960}},set(),now))
        self.assertFalse(hager.due(self.url,{key:{'checked_at':now-10,'extractor':983}},set(),now))
        self.assertTrue(hager.due(self.url,{key:{'checked_at':1,'extractor':960}},set(),now))

    def test_balanced_source_selection(self):
        urls=[self.url,'https://hager.com/de/katalog/produkt/aa1-schuko','https://hager.com/de/katalog/produkt/bb2-taster','https://hager.com/de/katalog/produkt/cc3-rahmen']
        self.assertEqual(hager.choose(sorted(urls),3)[0],self.url)
        self.assertEqual(len(set(hager.choose(urls,3))),3)


if __name__=='__main__':
    unittest.main()
