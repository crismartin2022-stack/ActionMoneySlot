# ActionMoneySlot

Backend propio y original para demo de slot, compatible con el frontend EGT existente sin copiar ni reutilizar matemática propietaria.

> Este proyecto **no es un casino real**. No incluye pagos, retiros, KYC, AML ni cumplimiento regulatorio.

## Resumen

`npm start` levanta un único servicio Node.js que:

- sirve el frontend actual en `/ActionMoneyEGT`
- mantiene compatibilidad con el bridge WebSocket existente en `/` y `/ws`
- conserva la API heredada en `/api`
- expone la API versionada en `/api/v1`
- persiste sesiones, juegos, spins, imágenes y API keys en SQLite usando `node:sqlite`
- incluye un panel administrativo protegido en `/admin?token=...`
- ejecuta un motor matemático propio configurable con historial auditable de seeds y resultados

## Requisitos

- Node.js `>= 22.13.0`
- npm

## Arranque rápido

```bash
npm install
npm test
npm start
```

Abrir:

```text
http://localhost:8080
```

Panel admin:

```text
http://localhost:8080/admin?token=<ACTION_MONEY_SLOT_ADMIN_TOKEN>
```

## Arquitectura

### Servidor

- `scripts/start-server.js`: HTTP server, static files, `/runtime-config.js`, `/health`, `/admin`
- `scripts/original-backend-core.js`: REST, WebSocket, SQLite, catálogo, sesiones, auditoría y administración
- `scripts/original-slot-engine.js`: motor matemático configurable, RNG server-side, free spins, bonus, respins y simulación RTP

### Persistencia SQLite

La base por defecto se crea en:

```text
/home/runner/work/ActionMoneySlot/ActionMoneySlot/data/action-money-slot.sqlite
```

Tablas principales:

- `sessions`
- `session_games`
- `game_catalog`
- `spin_history`
- `images`
- `api_keys`

## Compatibilidad

- `/api` sigue funcionando para no romper el backend/frontend actual
- `/api/v1` expone la versión documentada nueva
- `/` y `/ws` siguen aceptando el handshake WebSocket legado del runtime
- `runtime-config.js` sigue publicando `tcpHost`, `tcpPort`, `sslHost`, `apiBase`, `token` y `sessionId`

## API REST `/api/v1`

### Catálogo

- `GET /api/v1/games`
- `GET /api/v1/games/:gameId`
- `GET /api/v1/games/:gameId/config`
- `GET|POST /api/v1/games/:gameId/rtp`

### Sesiones

- `GET /api/v1/sessions`
- `POST /api/v1/sessions`
- `GET /api/v1/sessions/:sessionId`
- `POST /api/v1/sessions/:sessionId/select-game`
- `GET|POST /api/v1/sessions/:sessionId/balance`
- `GET /api/v1/sessions/:sessionId/spins`

### Imágenes

- `GET /api/v1/images`
- `POST /api/v1/images` `X-Admin-Token`
- `GET /api/v1/images/:imageId/content`
- `PUT /api/v1/images/:imageId` `X-Admin-Token`
- `DELETE /api/v1/images/:imageId` `X-Admin-Token`

### API keys

- `GET /api/v1/api-keys` `X-Admin-Token`
- `POST /api/v1/api-keys` `X-Admin-Token`
- `DELETE /api/v1/api-keys/:apiKeyId` `X-Admin-Token`
- `GET /api/v1/integrations/session-catalog` `X-API-Key`

### Administración

- `GET|POST /api/v1/admin/games` `X-Admin-Token`
- `POST /api/v1/admin/games/:gameId/duplicate` `X-Admin-Token`
- `PUT /api/v1/admin/games/:gameId/config` `X-Admin-Token`
- `POST /api/v1/admin/games/:gameId/publish` `X-Admin-Token`

## WebSocket

Endpoint:

- `ws://host/`
- `ws://host/ws`

Comandos soportados:

- `login`
- `settings`
- `configuration`
- `subscribe`
- `unsubscribe`
- `ping`
- `balance`
- `bet`
- `spin`

### Flujo documentado

1. `login`: autentica sesión y devuelve catálogo/resumen
2. `settings` o `configuration`: devuelve configuración del juego
3. `subscribe`: devuelve estado actual
4. `bet` o `spin`: procesa apuesta/spin
5. respuesta `bet` o `result`: incluye resultado, balance antes/después, bonus y free spins
6. `balance`: devuelve `balanceUpdate`

### Resultado de spin

La respuesta incluye:

- `complex.reels`
- `complex.lines`
- `complex.combos`
- `complex.balanceUpdate`
- `complex.result`
- `complex.bonus`
- `complex.freeSpins`

## Motor matemático propio

Características implementadas:

- RNG server-side auditable
- configuración de rodillos
- juego por líneas y soporte base para `ways`
- paytable configurable por símbolo
- apuestas y denominaciones configurables
- wild con multiplicador
- scatter con free spins
- bonus por combinaciones
- respins por bonus
- historial de seeds, apuestas y resultados en `spin_history`
- simulación de RTP por API

## Seguridad y administración

### Token admin

Variable:

- `ACTION_MONEY_SLOT_ADMIN_TOKEN`

Si no se configura, las rutas administrativas quedan deshabilitadas.

Cabecera:

- `X-Admin-Token: <token>`

### API keys de integración

Cabecera:

- `X-API-Key: <token>`

Las API keys se almacenan hasheadas con SHA-256 y solo se muestran completas al crearse.

## Variables de entorno

- `HOST`
- `PORT`
- `ACTION_MONEY_SLOT_API_BASE` o `API_BASE`
- `ACTION_MONEY_SLOT_DB_PATH`
- `ACTION_MONEY_SLOT_TCP_HOST` o `TCP_HOST`
- `ACTION_MONEY_SLOT_TCP_PORT` o `TCP_PORT`
- `ACTION_MONEY_SLOT_SSL_HOST` o `SSL_HOST`
- `ACTION_MONEY_SLOT_GAME_NAME` o `GAME_NAME`
- `ACTION_MONEY_SLOT_LANGUAGE` o `LANGUAGE`
- `ACTION_MONEY_SLOT_CURRENCY` o `CURRENCY`
- `ACTION_MONEY_SLOT_TOKEN` o `TOKEN`
- `ACTION_MONEY_SLOT_PLAYER_NAME`
- `ACTION_MONEY_SLOT_START_BALANCE`
- `ACTION_MONEY_SLOT_ADMIN_TOKEN`

## Pruebas

`npm test` ejecuta `scripts/validate-runtime.js` y cubre:

- compatibilidad del bootstrap/runtime
- salud del servidor
- REST heredado `/api`
- REST versionado `/api/v1`
- panel admin
- API keys
- imágenes
- duplicado/publicación de juegos
- WebSocket legado y comandos nuevos
- motor, bonus, free spins y simulación RTP
- persistencia de saldo e historial de spins

## Limitaciones

- El frontend visual sigue siendo el paquete EGT existente; este cambio sustituye backend y matemática, no assets.
- El panel admin es funcional pero deliberadamente simple.
- La simulación RTP es Monte Carlo y no una certificación formal.
- No se implementan pagos reales, geofencing, compliance ni reporting regulatorio.
