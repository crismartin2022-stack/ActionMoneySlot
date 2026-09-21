#!/usr/bin/env python3
"""Descomprime actionmoney.zip y deja una estructura segura y ordenada.

Uso:
    python scripts/cleanup_actionmoney.py
    python scripts/cleanup_actionmoney.py --force
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
import zipfile
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def remove_duplicate_files(root: Path) -> int:
    seen: dict[str, Path] = {}
    deleted = 0

    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue

        digest = sha256_file(path)
        if digest in seen:
            print(f"Borrando duplicado: {path}")
            path.unlink()
            deleted += 1
        else:
            seen[digest] = path

    return deleted


def remove_empty_dirs(root: Path) -> None:
    for current, dirs, files in os.walk(root, topdown=False):
        dirs.sort()
        current_path = Path(current)
        for directory in sorted(dirs, reverse=True):
            full_path = current_path / directory
            if not any(full_path.iterdir()):
                print(f"Borrando carpeta vacía: {full_path}")
                full_path.rmdir()


def extract_zip(zip_path: Path, destination: Path, force: bool = False) -> Path:
    if destination.exists():
        if not force:
            print(f"La carpeta ya existe: {destination}. Usa --force para reemplazarla.")
            return destination
        shutil.rmtree(destination)

    with zipfile.ZipFile(zip_path, "r") as archive:
        for member in archive.infolist():
            target_path = (destination / member.filename).resolve()
            if target_path.is_relative_to(destination.resolve()) is False:
                raise ValueError(f"Ruta insegura dentro del ZIP: {member.filename}")

            archive.extract(member, destination)

    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description="Extrae actionmoney.zip y limpia duplicados de forma segura.")
    parser.add_argument("--force", action="store_true", help="Reemplaza la carpeta de extracción si existe")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    zip_path = repo_root / "actionmoney.zip"

    if not zip_path.exists():
        print(f"No existe el archivo ZIP: {zip_path}", file=sys.stderr)
        return 1

    print(f"Descomprimiendo: {zip_path}")
    extracted_root = extract_zip(zip_path, repo_root / "_actionmoney_extracted", force=args.force)
    print(f"Carpeta extraída: {extracted_root}")

    if not extracted_root.exists():
        print("La extracción no produjo contenidos válidos.", file=sys.stderr)
        return 1

    print("Eliminando archivos duplicados...")
    deleted = remove_duplicate_files(extracted_root)
    print(f"Archivos duplicados eliminados: {deleted}")

    print("Eliminando carpetas vacías...")
    remove_empty_dirs(extracted_root)

    print(f"Proceso completado. Resultado en: {extracted_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
