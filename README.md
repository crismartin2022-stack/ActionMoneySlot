# ActionMoneySlot

Backend y frontend propios para demo de slot, con compatibilidad temporal para el frontend EGT legado sin copiar ni reutilizar matemática propietaria.

> Este proyecto **no es un casino real**. No incluye pagos, retiros, KYC, AML ni cumplimiento regulatorio.

## Resumen

`npm start` levanta un único servicio Node.js que:

- sirve el frontend propio en `/app` y lo expone como entrada principal en `/`
- mantiene el frontend EGT legado en `/ActionMoneyEGT` y `/legacy` durante la transición
- mantiene compatibilidad con el bridge WebSocket existente en `/` y `/ws`
- conserva la API heredada en `/api`
- expone la API versionada en `/api/v1`
- persiste sesiones, juegos, spins, imágenes y API keys en SQLite usando `node:sqlite`
- incluye una consola administrativa protegida en `/admin` con catálogo, RTP, assets, auditoría y API keys
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

Frontend propio:

```text
http://localhost:8080/app
```

Panel admin:

```text
http://localhost:8080/admin
```

Flujo:

1. abrir `/admin`
2. introducir `ACTION_MONEY_SLOT_ADMIN_TOKEN`
3. el backend crea una sesión admin con cookie httpOnly
4. las mutaciones del panel envían un token CSRF de sesión

## Arquitectura

### Servidor

- `scripts/start-server.js`: HTTP server, `/app`, `/legacy`, static files, `/runtime-config.js`, `/health`, `/admin`
- `scripts/original-backend-core.js`: REST, WebSocket, SQLite, catálogo, sesiones, auditoría y administración
- `scripts/original-slot-engine.js`: motor matemático configurable, RNG server-side, validación de configuración, free spins, bonus, respins y simulación RTP con métricas de confianza

### Persistencia SQLite

La base por defecto se crea en:

```text
/home/runner/work/ActionMoneySlot/ActionMoneySlot/data/action-money-slot.sqlite
```

Tablas principales:

- `sessions`
- `session_games`
- `game_catalog`
- `game_versions`
- `spin_history`
- `rtp_runs`
- `images`
- `api_keys`
- `admin_audit_log`

## Compatibilidad

- `/api` sigue funcionando para no romper integraciones existentes
- `/api/v1` expone la versión documentada nueva
- `/` y `/ws` siguen aceptando el handshake WebSocket legado del runtime
- `/legacy` conserva el arranque EGT existente mientras `/app` pasa a ser la UI principal
- `runtime-config.js` sigue publicando `tcpHost`, `tcpPort`, `sslHost`, `apiBase`, `token` y `sessionId`

## API REST `/api/v1`

### Catálogo

- `GET /api/v1/games`
- `GET /api/v1/games/:gameId`
- `GET /api/v1/games/:gameId/config`
- `GET|POST /api/v1/games/:gameId/rtp`
- `GET /api/v1/games/:gameId/rtp/history` `admin`

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
- `GET /api/v1/admin/games/:gameId/versions` `X-Admin-Token`
- `GET /api/v1/admin/audit` `X-Admin-Token`

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

## Frontend propio

- `/app/index.html` implementa lobby, selección de juego, conexión WebSocket, spin y visualización de resultados sin reutilizar `Game.min.js` ni assets visuales propietarios
- `/legacy` sigue redirigiendo al bundle EGT existente para compatibilidad temporal
- los `launchUrl` públicos apuntan al frontend propio y además devuelven `legacyLaunchUrl` para migraciones controladas

## Seguridad y administración

### Token admin

Variable:

- `ACTION_MONEY_SLOT_ADMIN_TOKEN`

Si no se configura, las rutas administrativas quedan deshabilitadas. Las sesiones admin expiran automáticamente.

Cabecera:

- `X-Admin-Token: <token>`

### API keys de integración

Cabecera:

- `X-API-Key: <token>`

Las API keys se almacenan con hash salado usando `scrypt` y solo se muestran completas al crearse. Las altas y revocaciones quedan registradas en auditoría.

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
- frontend propio `/app` y compatibilidad `/legacy`
- consola admin
- API keys
- imágenes
- duplicado/publicación/versionado de juegos
- historial RTP y auditoría admin
- WebSocket legado y comandos nuevos
- motor, bonus, free spins, validación matemática y simulación RTP
- persistencia de saldo e historial de spins

## Limitaciones

- `/legacy` sigue dependiendo del bundle EGT solo como ruta de compatibilidad temporal.
- La simulación RTP sigue siendo Monte Carlo; ahora guarda histórico y métricas, pero no sustituye una certificación formal.
- No se implementan pagos reales, geofencing, KYC, AML, compliance ni reporting regulatorio.
- El editor admin ya separa módulos operativos, pero algunas estructuras avanzadas (por ejemplo, símbolos y paylines complejos) siguen editándose en formato estructurado.
