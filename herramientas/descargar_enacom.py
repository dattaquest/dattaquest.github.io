#!/usr/bin/env python3
"""Descarga controlada de un XLS/XLSX/CSV oficial de ENACOM.

Se usa exclusivamente como entrada para actualizar_enacom.py.
La URL debe señalar un fichero público de enacom.gob.ar, no la página informativa.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MAX_BYTES = 30 * 1024 * 1024


def official(url: str) -> bool:
    p = urlparse(url)
    host = (p.hostname or '').lower()
    return p.scheme == 'https' and (host == 'enacom.gob.ar' or host.endswith('.enacom.gob.ar'))


def download(url: str, output: Path) -> None:
    if not official(url):
        raise ValueError('Solo se permiten enlaces HTTPS a archivos oficiales en enacom.gob.ar')
    req = Request(url, headers={'User-Agent': 'DattaQuest ENACOM public-data importer/1.0'})
    with urlopen(req, timeout=90) as response:
        if not official(response.geturl()):
            raise ValueError('La descarga fue redirigida a un sitio no autorizado')
        blob = response.read(MAX_BYTES + 1)
    if not 10000 <= len(blob) <= MAX_BYTES:
        raise ValueError('Archivo vacío, demasiado pequeño o demasiado grande')
    ext = output.suffix.lower()
    if ext == '.xls' and not blob.startswith(bytes.fromhex('D0CF11E0A1B11AE1')):
        raise ValueError('No se recibió un archivo XLS válido')
    if ext == '.xlsx' and not blob.startswith(b'PK'):
        raise ValueError('No se recibió un archivo XLSX válido')
    if ext == '.csv' and b'OPERADOR' not in blob[:4096].upper():
        raise ValueError('El archivo CSV no parece una exportación ENACOM')
    if ext not in ('.xls', '.xlsx', '.csv'):
        raise ValueError('Extensión no admitida')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(blob)
    print(f'Archivo oficial descargado: {output.name} ({len(blob)} bytes)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--salida', required=True, type=Path)
    args = parser.parse_args()
    download(args.url, args.salida)
