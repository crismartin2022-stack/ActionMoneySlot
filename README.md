# ActionMoneySlot

Repositorio organizado para ejecutar el juego desde la raíz con `npm install` y `npm start`.

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
npm install
```

## Arranque local

```bash
npm start
```

El servidor estático se inicia en `http://localhost:8080` (o `PORT` si está definido).

## Estructura principal

- `/index.html`: punto de entrada del frontend.
- `/main.js`: boot del juego (`com.egt.actionMoneySlot.Main`).
- `/Config.js`: configuración del juego y rutas de assets.
- `/assets/`: recursos gráficos, audio y datos del juego.
- `/css/`: estilos del shell/platform.
- `/scripts/start-server.js`: servidor estático en Node + `http-server`.
- `/Dockerfile`: imagen que instala dependencias con `npm install --omit=dev` y arranca con `scripts/start-server.js`.

## Notas importantes

- `actionmoney.zip` debe conservarse intacto cuando esté presente en la raíz, como respaldo/fuente original del paquete del juego. No es necesario para el arranque diario con `npm start`.
- La carpeta `_actionmoney_extracted/` y `node_modules/` se ignoran por `.gitignore`.
