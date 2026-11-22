#!/usr/bin/env python3
"""Convierte una copia TAC SQLite de Osmocom en JSON local para GitHub Pages.

Modo sin dependencias del navegador: no requiere sql.js ni CDN externos. Ejecutar:
 python otros-servicios/imei/tools/descargar_base_tac.py
 python otros-servicios/imei/tools/convertir_base_tac.py
Los archivos de salida son datos estáticos de lectura pública; solo TAC, marca y modelo.
Licencia del dataset Osmocom: CC BY-SA 3.0; conservar atribución y condiciones.
"""
from pathlib import Path
from collections import defaultdict
import argparse
import datetime as dt
import hashlib
import json
import sqlite3
import sys

HERE=Path(__file__).resolve().parents[1]
DB=HERE/'data'/'tac.sqlite'
OUT=HERE/'data'/'tac'
CONFIG=HERE/'data'/'config.json'

def convert(dbfile, outdir, minimum=1000):
    if not dbfile.is_file():raise FileNotFoundError(f'No existe {dbfile}. Primero descargá el catálogo comunitario.')
    shasum=hashlib.sha256(dbfile.read_bytes()).hexdigest()
    with sqlite3.connect(f'file:{dbfile.resolve()}?mode=ro',uri=True) as con:
        names={r[1] for r in con.execute('PRAGMA table_info(tac)')}
        if not {'tac','brand','model'}.issubset(names):raise ValueError('Esquema de tabla TAC incorrecto')
        rows=con.execute('SELECT tac,brand,model FROM tac').fetchall()
    result=defaultdict(dict)
    for tac,brand,model in rows:
        tac=str(tac).strip()
        if not tac.isdigit() or len(tac)!=8:continue
        brand=str(brand or '').strip()[:120]
        model=str(model or '').strip()[:200]
        if not brand or not model:continue
        result[tac[:2]][tac]=[brand,model]
    count=sum(len(v) for v in result.values())
    if count<minimum:raise ValueError(f'Solo {count} TAC válidos; no se publica base insuficiente')
    outdir.mkdir(parents=True,exist_ok=True)
    for old in outdir.glob('*.json'):old.unlink()
    for shard, data in result.items():
        (outdir/(shard+'.json')).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    meta={'local_json':True,'local_db':True,'registros':count,'sha256':shasum,
          'fuente':'Osmocom TAC — copia local, CC BY-SA 3.0',
          'generado_utc':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')}
    CONFIG.write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return count,len(result)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sqlite',type=Path,default=DB)
    parser.add_argument('--salida',type=Path,default=OUT)
    parser.add_argument('--minimo',type=int,default=1000)
    options=parser.parse_args()
    try:
        count,n=convert(options.sqlite,options.salida,options.minimo)
        print(f'OK: {count:,} TAC distribuidos en {n} JSON locales. Subí la carpeta data/tac/ y config.json a GitHub.')
    except Exception as exc:
        print(f'Error: {exc}',file=sys.stderr);sys.exit(1)
