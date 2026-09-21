#!/usr/bin/env python3
"""Extrae actionmoney.zip de forma segura y opcionalmente limpia duplicados.

Modo por defecto:
    - No destructivo (solo reporte / dry-run)
    - Valida rutas del ZIP para bloquear Zip Slip
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


def is_safe_member_path(destination: Path, member_name: str) -> bool:
    destination_resolved = destination.resolve()
    member_target = (destination / member_name).resolve()
    return destination_resolved == member_target or destination_resolved in member_target.parents


def validate_zip_members(archive: zipfile.ZipFile, destination: Path) -> list[zipfile.ZipInfo]:
    members: list[zipfile.ZipInfo] = []
    for member in archive.infolist():
        if member.filename.startswith(("/", "\\")):
            raise ValueError(f"Ruta absoluta no permitida en ZIP: {member.filename}")
        if not is_safe_member_path(destination, member.filename):
            raise ValueError(f"Posible Zip Slip detectado: {member.filename}")
        members.append(member)
    return members


def extract_zip(zip_path: Path, destination: Path, apply_changes: bool, overwrite: bool) -> Path:
    if destination.exists():
        if not overwrite:
            raise FileExistsError(
                f"La carpeta destino ya existe: {destination}. Usa --overwrite para permitir reemplazo."
            )
        if apply_changes:
            shutil.rmtree(destination)

    with zipfile.ZipFile(zip_path, "r") as archive:
        members = validate_zip_members(archive, destination)
        if apply_changes:
            destination.mkdir(parents=True, exist_ok=True)
            for member in members:
                archive.extract(member, destination)
        else:
            print(f"[dry-run] Archivos a extraer: {len(members)}")

    return destination


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extracción y limpieza segura de actionmoney.zip")
    parser.add_argument(
        "--zip",
        dest="zip_path",
        default="actionmoney.zip",
        help="Ruta al ZIP (por defecto: actionmoney.zip en la raíz del repo)",
    )
    parser.add_argument(
        "--dest",
        dest="destination",
        default="_actionmoney_extracted",
        help="Carpeta de salida (por defecto: _actionmoney_extracted)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Aplica cambios reales (por defecto solo dry-run no destructivo).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Permite reemplazar carpeta destino existente (requiere --apply).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[1]
    zip_path = Path(args.zip_path)
    if not zip_path.is_absolute():
        zip_path = repo_root / zip_path
    destination = Path(args.destination)
    if not destination.is_absolute():
        destination = repo_root / destination

    if not zip_path.exists():
        message = f"No existe el archivo ZIP: {zip_path}"
        if args.apply:
            print(message, file=sys.stderr)
            return 1
        print(f"[dry-run] {message}")
        return 0

    if args.overwrite and not args.apply:
        print("--overwrite requiere --apply", file=sys.stderr)
        return 1

    mode = "apply" if args.apply else "dry-run"
    print(f"Modo: {mode}")
    print(f"Descomprimiendo: {zip_path}")

    try:
        extracted_root = extract_zip(
            zip_path=zip_path,
            destination=destination,
            apply_changes=args.apply,
            overwrite=args.overwrite,
        )
    except (ValueError, FileExistsError) as error:
        print(str(error), file=sys.stderr)
        return 1

    print(f"Carpeta destino: {extracted_root}")

    if args.apply and not extracted_root.exists():
        print("La extracción no produjo contenidos válidos.", file=sys.stderr)
        return 1

    if not args.apply:
        print("[dry-run] Validación finalizada sin escribir archivos.")
        return 0

    print("Eliminando archivos duplicados...")
    deleted = remove_duplicate_files(extracted_root)
    print(f"Archivos duplicados eliminados: {deleted}")

    print("Eliminando carpetas vacías...")
    remove_empty_dirs(extracted_root)

    print(f"Proceso completado. Resultado en: {extracted_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
