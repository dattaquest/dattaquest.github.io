#!/usr/bin/env python3
"""Importa asignaciones geográficas públicas de ENACOM para DattaQuest.

No consulta portabilidad ni permite identificar titulares. No descarga desde portales
comerciales. Requiere un archivo original .xls/.xlsx/.csv obtenido de ENACOM.

Uso:
  python -m pip install -r herramientas/requirements.txt
  python herramientas/actualizar_enacom.py --archivo asignaciones.xls \
    --fuente https://www.enacom.gob.ar/asignaciones-a-la-fecha_p445

Los datos resultantes se publican localmente en GitHub Pages: no hay backend.
"""
from __future__ import annotations
import argparse
import csv
import datetime as dt
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRESTADORES = ROOT / 'otros-servicios' / 'prestadores' / 'data' / 'asignaciones.json'
PREFIJOS = ROOT / 'otros-servicios' / 'prefijos' / 'data' / 'prefijos.json'
PREFIJOS_META = ROOT / 'otros-servicios' / 'prefijos' / 'data' / 'fuente.json'
EXPECTED = ('OPERADOR','SERVICIO','MODALIDAD','LOCALIDAD','INDICATIVO','BLOQUE','RESOLUCION','FECHA')


def normal(t):
    text = unicodedata.normalize('NFKD', str(t or ''))
    return re.sub(r'[^A-Z0-9]+', ' ', ''.join(c for c in text if not unicodedata.combining(c)).upper()).strip()


def digits(cell):
    s = str(cell or '').strip()
    if re.fullmatch(r'\d+(?:\.0+)?', s):
        return s.split('.')[0]
    return ''


def read_rows(file):
    ext = file.suffix.lower()
    if ext == '.csv':
        # Puede contener coma o punto y coma; se detecta sin recortar ceros del bloque.
        for encoding in ('utf-8-sig', 'cp1252', 'latin-1'):
            try:
                with file.open(encoding=encoding, newline='') as f:
                    sample = f.read(10000)
                    f.seek(0)
                    delimiter = csv.Sniffer().sniff(sample, delimiters=',;\t').delimiter
                    return list(csv.reader(f, delimiter=delimiter))
            except (UnicodeDecodeError, csv.Error):
                continue
        raise ValueError('No se pudo interpretar el archivo CSV')
    if ext in ('.xls','.xlsx'):
        try:
            import pandas as pd
            data = pd.read_excel(file, sheet_name=0, header=None, dtype=str, keep_default_na=False)
        except ImportError as err:
            raise SystemExit('Instalá xlrd para .xls: python -m pip install -r herramientas/requirements.txt') from err
        return data.values.tolist()
    raise ValueError('El archivo debe ser .xls, .xlsx o .csv')


def parse_source(file, source_url, min_filas=1000):
    rows = read_rows(file)
    header_at = None
    indices = {}
    for i, row in enumerate(rows[:35]):
        cols = {normal(v): p for p, v in enumerate(row)}
        if all(key in cols for key in EXPECTED):
            header_at = i
            indices = cols
            break
    if header_at is None:
        raise ValueError('No encontré las 8 columnas ENACOM: '+', '.join(EXPECTED))

    source_sha = hashlib.sha256(file.read_bytes()).hexdigest()
    old_areas = {}
    if PREFIJOS.exists():
        try:
            old_areas = {x['codigo']:x for x in json.loads(PREFIJOS.read_text(encoding='utf-8')) if isinstance(x,dict)}
        except (ValueError, KeyError):
            pass

    assignments, areas = {}, {}
    ignored = 0
    warnings = []
    for lineno, row in enumerate(rows[header_at+1:], start=header_at+2):
        def g(key):
            ix = indices[key]
            return str(row[ix]).strip() if ix < len(row) else ''
        area, block = digits(g('INDICATIVO')), digits(g('BLOQUE'))
        if not (len(area) in (2,3,4) and block and area[0] in '123' and block[0] in '23456789' and len(area+block) <= 10):
            ignored += 1
            continue
        operador = re.sub(r'\s+', ' ',g('OPERADOR')).strip()
        localidad = re.sub(r'\s+', ' ',g('LOCALIDAD')).strip()
        servicio = re.sub(r'\s+', ' ',g('SERVICIO')).strip()
        res = re.sub(r'\s+', ' ',g('RESOLUCION')).strip()
        if not operador or not localidad:
            warnings.append(f'Fila {lineno}: operador o localidad vacío')
            ignored += 1
            continue
        key = area + block
        if key in assignments:
            old = assignments[key]
            if old[1] != operador:
                warnings.append(f'Fila {lineno}: prefijo duplicado con operadores distintos ({key})')
            continue
        assignments[key] = [key,operador,servicio,localidad,res,area]
        # ENACOM publica localidad CABECERA, no necesariamente localidad precisa de cada abonado.
        if area not in areas:
            areas[area] = localidad
        elif areas[area] != localidad:
            warnings.append(f'Fila {lineno}: indicador {area} tiene localidades diferentes')

    if len(assignments) < min_filas or len(areas) < (30 if min_filas >= 1000 else 1):
        raise ValueError(f'Se detectaron solo {len(assignments)} bloques y {len(areas)} áreas; no se reemplazó la base. Revisá si es el archivo oficial completo.')
    if len(warnings) > 500:
        raise ValueError('Demasiadas inconsistencias en el archivo; no se publica la base')
    assignments_out = [r[:5] for r in sorted(assignments.values(), key=lambda r:(len(r[0]),r[0]))]
    prefixes_out = []
    for area, locality in sorted(areas.items(),key=lambda i:(len(i[0]),i[0])):
        old = old_areas.get(area,{})
        # Provincias: datos heredados solo de coincidencias ya validadas; fuente XLS no trae provincia.
        provinces = old.get('provincia','') if normal(old.get('localidad','')) == normal(locality) else ''
        prefixes_out.append({'codigo':area,'localidad':locality,'provincia':provinces})
    meta = {'origen':'ENACOM — asignaciones de numeración geográfica',
            'url':source_url, 'archivo':file.name,'sha256':source_sha,
            'generado_utc':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
            'bloques':len(assignments_out),'indicativos':len(prefixes_out),
            'observacion':'Operadores ORIGINALES asignados a bloques; no información de portabilidad, activación, titularidad ni operador actual.'}
    return {'meta':meta, 'bloques':assignments_out}, prefixes_out, meta, ignored, warnings


def atomic_write(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp = path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(',',':'))+'\n',encoding='utf-8')
    temp.replace(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--archivo',required=True,type=Path)
    ap.add_argument('--fuente',default='https://www.enacom.gob.ar/asignaciones-a-la-fecha_p445',help='URL oficial de procedencia')
    ap.add_argument('--min-filas',type=int,default=1000,help='Mínimo de bloques esperado (1000 por defecto)')
    args=ap.parse_args()
    if not args.archivo.is_file():ap.error(f'No existe el archivo: {args.archivo}')
    if not args.fuente.startswith(('https://www.enacom.gob.ar/','https://enacom.gob.ar/')):
        ap.error('La URL de fuente debe ser de ENACOM')
    blocks,prefixes,meta,ignored,warnings = parse_source(args.archivo,args.fuente,args.min_filas)
    # Primero se validan TODOS los datos; solo después se reemplazan las salidas.
    atomic_write(PRESTADORES,blocks)
    atomic_write(PREFIJOS,prefixes)
    atomic_write(PREFIJOS_META,meta)
    print(f'OK: {meta["bloques"]:,} bloques y {meta["indicativos"]} indicativos.')
    print(f'SHA-256: {meta["sha256"]}\nArchivo: {meta["archivo"]}')
    print(f'Filas ignoradas: {ignored} | avisos: {len(warnings)}')
    for w in warnings[:5]:print('Aviso:',w)
    print('Subí las tres salidas JSON a GitHub conservando carpetas.')

if __name__ == '__main__':main()
