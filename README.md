# ActionMoneySlot

Repositorio estático del bundle HTML5 de ActionMoneySlot.

## Estado actual

- `npm install` y `npm start` funcionan desde la raíz del repositorio.
- El proyecto sirve el contenido local en el puerto `8080` por defecto.
- El entry point ahora intenta arrancar el bootstrap real del juego antes de caer en una vista de diagnóstico.
- Este clon **no incluye** `lib/gamy.min.js` ni `lib/egt-library.min.js`, por lo que el runtime EGT completo no puede inicializarse sin esos archivos.

## Arranque local

```bash
npm install
npm start
```

Abrir:

```text
http://localhost:8080
```

También puedes cambiar el puerto:

```bash
PORT=3000 npm start
```

## Estructura relevante

```text
.
├── assets/
├── css/
├── scripts/
│   ├── cleanup_actionmoney.py
│   └── start-server.js
├── BonusAnimation.min.js
├── Config.js
├── content.json
├── FreespinAnimation.min.js
├── Game.min.js
├── gpts.min.js
├── index.html
├── main.js
├── options.js
├── package.json
└── README.md
```

## Limitación importante

El repositorio contiene assets, configuración y bundles del juego, pero faltan librerías propietarias del engine EGT requeridas por `gpts.min.js`. Mientras no estén presentes en `lib/`, la app mostrará un diagnóstico útil en lugar de fallar silenciosamente.

## Docker

```bash
docker build -t actionmoneyslot .
docker run -p 8080:8080 actionmoneyslot
```
