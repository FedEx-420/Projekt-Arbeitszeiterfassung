import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from update_german_products import declaration,documents,safety_scope
class EvidenceTests(unittest.TestCase):
 def test_exact_model(self):
  text='EU DECLARATION OF CONFORMITY\n12345 socket\n2014/35/EU\nEN 61643-11:2012'
  self.assertTrue(declaration(text,'12345'));self.assertFalse(declaration(text,'1234'));self.assertTrue(safety_scope(text))
 def test_ce_and_rohs_are_insufficient(self):
  self.assertFalse(declaration('CE approved 12345','12345'));self.assertFalse(safety_scope('EU DECLARATION OF CONFORMITY\n12345 socket\n2011/65/EU EN IEC 63000:2018'))
 def test_only_product_declaration_links(self):
  text='<a href="https://assets.hager.com/step-content/a.pdf" data-dlcat-code="ProductECDeclaration">PDF</a><a href="https://evil.test/a.pdf" data-dlcat-code="ProductECDeclaration">Fake</a><a href="https://assets.hager.com/step-content/image.pdf">Image</a>'
  self.assertEqual(documents(text),['https://assets.hager.com/step-content/a.pdf'])
if __name__=='__main__':unittest.main()
