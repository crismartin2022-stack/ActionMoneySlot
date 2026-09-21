# ActionMoneySlot

Repositorio estático del juego ActionMoneySlot servido desde la raíz del proyecto.

## Estructura principal

- `index.html`: entry point web.
- `main.js`: inicialización del runtime y fallback de diagnóstico.
- `Config.js`: configuración del juego (líneas, sonidos, rutas de assets).
- `assets/`: imágenes, sonidos, videos y fuentes del juego.
- `scripts/cleanup_actionmoney.py`: extracción segura de `actionmoney.zip` (si se provee localmente).

## Ejecutar en local

```bash
npm install
npm start
```

Servidor: `http://localhost:8080`

## Docker

```bash
docker build -t actionmoneyslot .
docker run --rm -p 8080:8080 actionmoneyslot
```

Servidor: `http://localhost:8080`

## Validaciones útiles

```bash
npm run check:js
npm run check:extract
```

- `check:js`: valida sintaxis de los JS editables.
- `check:extract`: ejecuta extracción segura en modo dry-run (no escribe archivos).

## Extracción segura del ZIP original

Si dispones de `actionmoney.zip` en la raíz:

```bash
python3 scripts/cleanup_actionmoney.py
```

El script corre en modo no destructivo por defecto, valida rutas contra Zip Slip y solo reporta.

Para aplicar la extracción real:

```bash
python3 scripts/cleanup_actionmoney.py --apply --overwrite
```

## Diagnóstico básico

Si la pantalla muestra error de dependencias faltantes (`Game`, `Bottle`, `Pluck`, etc.):

1. Verifica que todos los archivos originales del paquete HTML5 estén presentes.
2. Revisa consola del navegador y rutas solicitadas (404/errores de carga).
3. Comprueba que `Config.js` y `assets/` estén sirviéndose desde la raíz.
