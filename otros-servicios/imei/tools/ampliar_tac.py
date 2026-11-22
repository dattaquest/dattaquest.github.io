#!/usr/bin/env python3
"""Descarga, valida y divide una fuente TAC comunitaria adicional.

Origen: github.com/MoazEb/tac-database, licencia declarada MIT.
Contiene aportes derivados de Osmocom bajo CC BY-SA 3.0.
La base TAC NO permite verificar bloqueo, autenticidad ni activación.
"""
from __future__ import annotations
import csv
import datetime as dt
import hashlib
import io
import json
import re
import shutil
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

URL = "https://raw.githubusercontent.com/MoazEb/tac-database/main/tac_full.csv"
MAX_BYTES = 20_000_000
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "tac-ampliado"

def convert(data: bytes, destination: Path, minimum: int = 100_000):
    text = data.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("Archivo sin cabecera")
    fields = {x.strip().upper(): x for x in reader.fieldnames}
    if not {"BRAND", "TAC", "SPECS"}.issubset(fields):
        raise ValueError("Se esperan columnas Brand, TAC y SPECS")
    by_prefix = {}
    for row in reader:
        code = str(row.get(fields["TAC"]) or "").strip()
        brand = " ".join(str(row.get(fields["BRAND"]) or "").split())[:90]
        model = " ".join(str(row.get(fields["SPECS"]) or "").split())[:180]
        if not re.fullmatch(r"\d{8}", code) or not brand or not model:
            continue
        by_prefix.setdefault(code[:2], {}).setdefault(code, [brand, model])
    total = sum(len(group) for group in by_prefix.values())
    if total < minimum:
        raise ValueError("Catálogo insuficiente: " + str(total))
    destination.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix="datta-extra-", dir=destination.parent))
    try:
        for prefix, values in by_prefix.items():
            (stage / (prefix+".json")).write_text(
                json.dumps(values, ensure_ascii=False, separators=(",", ":"))+"\n",
                encoding="utf-8")
        metadata = {
            "registros": total,
            "url": URL,
            "sha256": hashlib.sha256(data).hexdigest(),
            "generado_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "origen": "MoazEb/tac-database (compilación comunitaria)",
            "licencias": "MIT para aportes propios; las fuentes derivadas Osmocom conservan CC BY-SA 3.0"
        }
        (stage / "meta.json").write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
        if destination.exists():
            shutil.rmtree(destination)
        stage.replace(destination)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    return total

def main():
    request = Request(URL, headers={"User-Agent": "DattaQuest open-data import/1.0"})
    with urlopen(request, timeout=120) as response:
        if response.geturl() != URL:
            raise ValueError("La fuente redirigió a otra dirección")
        content = response.read(MAX_BYTES+1)
    if len(content) < 1_000_000 or len(content) > MAX_BYTES:
        raise ValueError("Tamaño inesperado del catálogo")
    print("Catálogo ampliado:",convert(content, OUTPUT),"registros TAC")

if __name__ == "__main__":
    main()
