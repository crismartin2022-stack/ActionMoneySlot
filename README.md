# ActionMoneySlot

Este repositorio ahora incluye:

- frontend del juego en `/home/runner/work/ActionMoneySlot/ActionMoneySlot/ActionMoneyEGT`
- servidor HTTP Node.js en `/home/runner/work/ActionMoneySlot/ActionMoneySlot/scripts/start-server.js`
- backend API REST y backend WebSocket del juego en `/home/runner/work/ActionMoneySlot/ActionMoneySlot/scripts/game-backend.js`

## Qué hace ahora el repositorio

`npm start` levanta un único servicio Node.js que:

- sirve el frontend
- expone `/runtime-config.js`
- expone API REST en `/api/*`
- acepta WebSocket en `/` para que el runtime del juego pueda iniciar sesión, cargar settings, suscribirse y jugar

## Endpoints principales

- `GET /health`
- `GET /api/games`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:sessionId`
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

El frontend genera o reutiliza `sessionId` en `sessionStorage` y el backend crea la sesión en memoria si todavía no existe.

## Crear una sesión por API

```bash
curl -X POST http://localhost:8080/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"playerName":"demo","balance":500000,"currency":"EUR","language":"en"}'
```

La respuesta incluye `session.id` y `launchUrl`.

## Variables de entorno soportadas

- `HOST` - host HTTP del servidor (`0.0.0.0` por defecto)
- `PORT` - puerto HTTP del servidor (`8080` por defecto)
- `ACTION_MONEY_SLOT_TCP_HOST` o `TCP_HOST` - host WebSocket publicado en `runtime-config.js` (si no se define, usa el mismo host de la petición HTTP)
- `ACTION_MONEY_SLOT_TCP_PORT` o `TCP_PORT` - puerto WebSocket publicado en `runtime-config.js` (si no se define, usa el mismo puerto de la petición HTTP)
- `ACTION_MONEY_SLOT_SSL_HOST` o `SSL_HOST` - `true` para `wss`, `false` para `ws` (si no se define, se infiere por `x-forwarded-proto`)
- `ACTION_MONEY_SLOT_GAME_NAME` o `GAME_NAME` - nombre inicial del juego (`ActionMoneySlot`)
- `ACTION_MONEY_SLOT_LANGUAGE` o `LANGUAGE` - idioma inicial (`en`)
- `ACTION_MONEY_SLOT_CURRENCY` o `CURRENCY` - moneda inicial (`EUR`)
- `ACTION_MONEY_SLOT_TOKEN` o `TOKEN` - sesión inicial opcional; también se publica como `sessionId`
- `ACTION_MONEY_SLOT_PLAYER_NAME` - nombre por defecto del jugador demo
- `ACTION_MONEY_SLOT_START_BALANCE` - saldo inicial por defecto para sesiones creadas automáticamente

## Limitaciones actuales

- El backend es **en memoria**; reiniciar el proceso borra sesiones y saldo.
- La implementación incluida cubre el flujo mínimo para correr `ActionMoneySlot` con login, settings, subscribe y apuestas básicas.
- La arquitectura soporta descubrir más juegos bajo `ActionMoneyEGT/html5/games/*/*`, pero la lógica específica de cada juego adicional debe añadirse si requiere reglas o respuestas distintas.
