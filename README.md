# ActionMoneySlot

Este repositorio ahora incluye:

- frontend del juego en `/home/runner/work/ActionMoneySlot/ActionMoneySlot/ActionMoneyEGT`
- servidor HTTP Node.js en `/home/runner/work/ActionMoneySlot/ActionMoneySlot/scripts/start-server.js`
- backend API REST + backend WebSocket del juego en `/home/runner/work/ActionMoneySlot/ActionMoneySlot/scripts/game-backend.js`
- persistencia real en SQLite usando `node:sqlite`

## Qué hace ahora el repositorio

`npm start` levanta un único servicio Node.js que:

- sirve el frontend
- expone `/runtime-config.js`
- expone API REST configurable por `apiBase`
- acepta WebSocket en `/` para login, settings, subscribe y apuestas
- persiste sesiones, saldo y estado por juego en SQLite
- descubre juegos disponibles bajo `ActionMoneyEGT/html5/games/*/*/Config.js`

## Requisitos

- Node.js 22.13.0 o superior
- npm

> Este proyecto depende de `node:sqlite` y `DatabaseSync`, disponibles sin flags a partir de Node.js 22.13.0.

> `apiBase` no puede ser `/` ni `/ws`, porque esas rutas quedan reservadas para el bridge WebSocket del juego.

## Endpoints principales

- `GET /health`
- `GET /api/games`
- `GET /api/games/:gameIdentificationNumber`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:sessionId`
- `POST /api/sessions/:sessionId/select-game`
- `POST /api/sessions/:sessionId/balance`

## Flujo rápido local

```bash
npm install
npm test
npm start
```

Abrir:

```text
http://localhost:8080
```

El backend crea y mantiene una sesión persistente `demo-session` para correr local sin setup extra.

## Crear una sesión por API

```bash
curl -X POST http://localhost:8080/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"playerName":"demo","balance":500000,"currency":"EUR","language":"en","gameType":"AMJSlot"}'
```

La respuesta incluye:

- `session`
- `launchUrl`
- listado de juegos disponibles

## Cambiar el juego seleccionado de una sesión

```bash
curl -X POST http://localhost:8080/api/sessions/<sessionId>/select-game \
  -H 'Content-Type: application/json' \
  -d '{"gameIdentificationNumber":1}'
```

## Persistencia SQLite

Por defecto la base se crea en:

```text
/home/runner/work/ActionMoneySlot/ActionMoneySlot/data/action-money-slot.sqlite
```

Se puede cambiar con:

- `ACTION_MONEY_SLOT_DB_PATH`

Se persisten:

- sesiones
- saldo
- juego seleccionado
- estado por juego
- estado del RNG por juego

## Variables de entorno soportadas

- `HOST` - host HTTP del servidor (`0.0.0.0` por defecto)
- `PORT` - puerto HTTP del servidor (`8080` por defecto)
- `ACTION_MONEY_SLOT_API_BASE` o `API_BASE` - base de la API (`/api` por defecto)
- `ACTION_MONEY_SLOT_DB_PATH` - ruta del archivo SQLite
- `ACTION_MONEY_SLOT_TCP_HOST` o `TCP_HOST` - host WebSocket publicado en `runtime-config.js` (si no se define, usa el mismo host de la petición HTTP)
- `ACTION_MONEY_SLOT_TCP_PORT` o `TCP_PORT` - puerto WebSocket publicado en `runtime-config.js` (si no se define, usa el mismo puerto de la petición HTTP)
- `ACTION_MONEY_SLOT_SSL_HOST` o `SSL_HOST` - `true` para `wss`, `false` para `ws` (si no se define, se infiere por `x-forwarded-proto`)
- `ACTION_MONEY_SLOT_GAME_NAME` o `GAME_NAME` - nombre inicial del juego (`ActionMoneySlot`)
- `ACTION_MONEY_SLOT_LANGUAGE` o `LANGUAGE` - idioma inicial (`en`)
- `ACTION_MONEY_SLOT_CURRENCY` o `CURRENCY` - moneda inicial (`EUR`)
- `ACTION_MONEY_SLOT_TOKEN` o `TOKEN` - sesión inicial opcional; también se publica como `sessionId`
- `ACTION_MONEY_SLOT_PLAYER_NAME` - nombre por defecto del jugador demo
- `ACTION_MONEY_SLOT_START_BALANCE` - saldo inicial por defecto para sesiones creadas automáticamente

## Soporte multi-juego

El backend ya no está cableado solo a `ActionMoneySlot`:

- descubre juegos por carpeta/config
- expone el catálogo por API
- permite seleccionar juego por sesión
- construye `launchUrl` con `game`, `gameType`, `gameIdentificationNumber`, `sessionId` y `apiBase`

Si agregas más paquetes compatibles bajo `ActionMoneyEGT/html5/games`, aparecerán automáticamente en el catálogo si incluyen `Config.js`.

## Limitaciones actuales

- La lógica de apuesta incluida es genérica para slots y cubre el flujo mínimo del runtime.
- Si un juego adicional requiere reglas especiales, bonus propietarios o mensajes distintos, habrá que extender el bridge para ese juego concreto.
- `node:sqlite` sigue marcado como experimental en Node 22.13+, pero en este repo ya queda soportado sobre esa versión mínima.
