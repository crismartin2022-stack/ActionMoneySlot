#!/usr/bin/env python3
"""Descomprime actionmoney.zip, elimina archivos duplicados y ordena la estructura.

Uso:
    python scripts/cleanup_actionmoney.py
"""

from __future__ import annotations

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


def sort_directories(root: Path) -> None:
    for current, dirs, files in os.walk(root):
        dirs[:] = sorted(dirs)
        for file_name in sorted(files):
            file_path = Path(current) / file_name
            file_path.rename(Path(current) / file_name)


def extract_zip(zip_path: Path, destination: Path) -> Path:
    if destination.exists():
        shutil.rmtree(destination)

    with zipfile.ZipFile(zip_path, "r") as archive:
        archive.extractall(destination)

    return destination


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    zip_path = repo_root / "actionmoney.zip"

    if not zip_path.exists():
        print(f"No existe el archivo ZIP: {zip_path}", file=sys.stderr)
        return 1

    print(f"Descomprimiendo: {zip_path}")
    extracted_root = extract_zip(zip_path, repo_root / "_actionmoney_extracted")
    print(f"Carpeta extraída: {extracted_root}")

    if not extracted_root.exists():
        print("La extracción no produjo contenidos válidos.", file=sys.stderr)
        return 1

    print("Eliminando archivos duplicados...")
    deleted = remove_duplicate_files(extracted_root)
    print(f"Archivos duplicados eliminados: {deleted}")

    print("Eliminando carpetas vacías...")
    remove_empty_dirs(extracted_root)

    print("Ordenando carpetas...")
    sort_directories(extracted_root)

    print(f"Proceso completado. Resultado en: {extracted_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
