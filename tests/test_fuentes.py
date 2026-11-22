import importlib.util
import sqlite3
import tempfile
import unittest
import pathlib
import json

ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path)
 module=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(module)
 return module

class FuenteTests(unittest.TestCase):
 def test_importador_csv_compatible(self):
  imp=load('enacom',ROOT/'herramientas'/'actualizar_enacom.py')
  with tempfile.TemporaryDirectory() as d:
   file=pathlib.Path(d)/'enacom_ejemplo_simulado.csv'
   file.write_text('OPERADOR;SERVICIO;MODALIDAD;LOCALIDAD;INDICATIVO;BLOQUE;RESOLUCION;FECHA\n'
                   'EMPRESA PRUEBA;PCS;CPP;AMBA;11;4321;TEST 1;45900\n'
                   'OTRA EMPRESA PRUEBA;SBT;CPP;LA PLATA;221;480;TEST 2;45900\n'
                   'EMPRESA PRUEBA;PCS;CPP;AMBA;11;4322;TEST 3;45900\n',encoding='utf-8')
   blocks,prefixes,meta,ignored,warnings=imp.parse_source(file,'https://www.enacom.gob.ar/asignaciones-a-la-fecha_p445',min_filas=2)
   self.assertEqual(meta['bloques'],3)
   self.assertEqual(meta['indicativos'],2)
   self.assertIn(['114321','EMPRESA PRUEBA','PCS','AMBA','TEST 1'],blocks['bloques'])
   self.assertEqual(len(meta['sha256']),64)
   self.assertEqual(ignored,0)

 def test_invalid_source_does_not_write(self):
  imp=load('enacom2',ROOT/'herramientas'/'actualizar_enacom.py')
  with tempfile.TemporaryDirectory() as d:
   file=pathlib.Path(d)/'bad.csv'
   file.write_text('a,b,c\n1,2,3\n',encoding='utf8')
   with self.assertRaises(ValueError):
    imp.parse_source(file,'https://www.enacom.gob.ar/asignaciones-a-la-fecha_p445')

 def test_tac_converter_local_json(self):
  convert=load('tac',ROOT/'otros-servicios'/'imei'/'tools'/'convertir_base_tac.py')
  with tempfile.TemporaryDirectory() as d:
   base=pathlib.Path(d)
   db=base/'test.sqlite'
   with sqlite3.connect(db) as connection:
    connection.execute('CREATE TABLE tac (tac TEXT, brand TEXT, model TEXT)')
    connection.execute('INSERT INTO tac VALUES (?,?,?)',('12345678','Marca de prueba','Modelo de prueba'))
    connection.execute('INSERT INTO tac VALUES (?,?,?)',('12345679','Marca 2 de prueba','Modelo 2 de prueba'))
   old=convert.CONFIG
   convert.CONFIG=base/'config.json'
   try:
    n,shards=convert.convert(db,base/'out',minimum=2)
    self.assertEqual(n,2)
    self.assertEqual(shards,1)
    results=json.loads((base/'out'/'12.json').read_text(encoding='utf8'))
    self.assertEqual(results['12345678'][1],'Modelo de prueba')
    self.assertTrue(json.loads(convert.CONFIG.read_text())['local_json'])
   finally:convert.CONFIG=old

if __name__ == '__main__':unittest.main()
