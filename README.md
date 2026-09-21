# ActionMoneySlot

Restauración del bundle HTML5 real de `actionmoney.zip`, servido directamente desde la raíz del repositorio.

## Origen del juego

- `actionmoney.zip` se conserva como fuente original del paquete.
- El contenido ejecutable del juego se rehidrató desde ese ZIP en una estructura web limpia para que el arranque funcione desde la raíz del repo.

## Arranque local

```bash
npm install
npm start
```

Abrir en el navegador:

```text
http://localhost:8080
```

Puerto alternativo:

```bash
PORT=3000 npm start
```

## Entry point real

- `index.html` carga el bootstrap web desde la raíz.
- `main.js` inicia `initDesktopHtml(...)`.
- `Config.js` define la configuración de arranque por defecto para el runtime EGT.
- `init/init_desktop_cf_test.js`, `options.js` y `gpts.min.js` provienen del ZIP original.

## Estructura relevante

```text
.
├── actionmoney.zip
├── assets/
├── games/
│   ├── ActionMoneySlot/
│   └── commonAssets/
├── init/
├── js/
├── lib/
├── Config.js
├── content.json
├── device.min.js
├── gpts.min.js
├── index.html
├── main.js
├── options.js
├── platform.css
└── scripts/start-server.js
```

## Parámetros opcionales

Se pueden sobrescribir desde query string:

- `sessionKey`
- `tcpHost`
- `tcpPort`
- `lang`
- `sslHost`
- `gameName`

Ejemplo:

```text
http://localhost:8080/?lang=es&sslHost=true
```

## Limitaciones

- El juego arranca con parámetros demo por defecto del runtime incluido en el bundle.
- La jugabilidad completa depende de que el endpoint websocket remoto configurado siga disponible.

## Docker

```bash
docker build -t actionmoneyslot .
docker run -p 8080:8080 actionmoneyslot
```
