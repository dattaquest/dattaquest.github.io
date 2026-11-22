#!/usr/bin/env python3
"""Copia la base pública de códigos TAC al propio proyecto DattaQuest.
Fuente: Osmocom, licencia CC-BY-SA 3.0. © Harald Welte y colaboradores.
La URL del snapshot queda publicada a título de atribución.
"""
from pathlib import Path
from urllib.request import urlopen, Request
import json, sqlite3, tempfile, os

HERE=Path(__file__).resolve().parent.parent
OUT=HERE/'data'/'tac.sqlite'
SOURCE='https://raw.githubusercontent.com/G33l0/imei-generator/main/data/tac.sqlite'
print('Descargando copia de datos TAC públicos desde GitHub...')
req=Request(SOURCE,headers={'User-Agent':'DattaQuest/1.0 (+https://github.com/dattaquest/dattaquest.github.io)'})
with urlopen(req,timeout=35) as r:
    data=r.read(15_000_001)
if len(data)<50_000 or len(data)>15_000_000 or not data.startswith(b'SQLite format 3\0'):
    raise SystemExit('Respuesta inválida o demasiado grande; no se modificaron datos.')
with tempfile.NamedTemporaryFile(suffix='.sqlite',delete=False) as f:
    f.write(data); tmp=Path(f.name)
try:
    with sqlite3.connect(f'file:{tmp}?mode=ro',uri=True) as db:
        n=db.execute('SELECT count(*) FROM tac').fetchone()[0]
        row=db.execute('SELECT brand,model FROM tac LIMIT 1').fetchone()
        if n<1000 or not row: raise ValueError('Catálogo TAC incompleto')
    OUT.write_bytes(data)
    (HERE/'data'/'config.json').write_text(json.dumps({'local_db':True,'registros':n,'fuente':'Osmocom CC-BY-SA 3.0'},ensure_ascii=False)+'\n',encoding='utf8')
    print(f'Copia propia guardada en {OUT}: {n:,} TAC. Subila a GitHub con config.json.')
except Exception:
    print('No se pudo verificar la base; no la publiques.');raise
finally:tmp.unlink(missing_ok=True)
