# ActionMoneySlot

Este repositorio **sí contiene**:

- frontend del juego en `/home/runner/work/ActionMoneySlot/ActionMoneySlot/ActionMoneyEGT`
- servidor HTTP Node.js en `/home/runner/work/ActionMoneySlot/ActionMoneySlot/scripts/start-server.js`
- `package.json`
- `railway.json`

Este repositorio **no contiene** actualmente:

- Laravel/PHP
- `composer.json`
- `PTWebSocket/Server.js`
- `Addons/MySQL`
- `public/socket_config.json`
- `Dockerfile`
- credenciales, tokens reales ni configuración MySQL lista para importar

## Qué hace hoy el repositorio

`npm start` sirve el frontend y redirige `/` a `ActionMoneyEGT/html5/index.html`.

El frontend lee `/runtime-config.js`, que se genera desde variables de entorno del servicio HTTP. Si no se define un backend WebSocket real, el juego ahora falla de forma explícita en vez de inventar hosts, puertos o tokens.

## Variables de entorno soportadas por el servicio actual

- `HOST` - host HTTP del servidor (`0.0.0.0` por defecto)
- `PORT` - puerto HTTP del servidor (`8080` por defecto; Railway lo inyecta automáticamente)
- `ACTION_MONEY_SLOT_TCP_HOST` o `TCP_HOST` - host del backend WebSocket
- `ACTION_MONEY_SLOT_TCP_PORT` o `TCP_PORT` - puerto del backend WebSocket
- `ACTION_MONEY_SLOT_SSL_HOST` o `SSL_HOST` - `true` para `wss`, `false` para `ws`
- `ACTION_MONEY_SLOT_GAME_NAME` o `GAME_NAME` - nombre del juego (`ActionMoneySlot`)
- `ACTION_MONEY_SLOT_LANGUAGE` o `LANGUAGE` - idioma inicial (`en`)
- `ACTION_MONEY_SLOT_CURRENCY` o `CURRENCY` - moneda inicial (`EUR`)
- `ACTION_MONEY_SLOT_TOKEN` o `TOKEN` - token/sesión inicial, si el backend real lo requiere

## Ejecutar localmente

```bash
npm install
npm test
npm start
```

Abrir:

```text
http://localhost:8080
```

Si `ACTION_MONEY_SLOT_TCP_HOST` o `ACTION_MONEY_SLOT_TCP_PORT` no están definidos, el frontend mostrará un error de configuración en lugar de conectarse a un host ficticio.

## Despliegue en Railway

### Servicio que sí puede desplegarse con este repo

Un servicio Node.js para servir el frontend:

- **Build command**: `npm install`
- **Start command**: `npm start`
- **Healthcheck**: `/health`
- **Puerto HTTP**: `process.env.PORT`

Variables mínimas recomendadas en Railway para ese servicio:

```text
ACTION_MONEY_SLOT_TCP_HOST=<host-del-websocket-real>
ACTION_MONEY_SLOT_TCP_PORT=<puerto-del-websocket-real>
ACTION_MONEY_SLOT_SSL_HOST=true
ACTION_MONEY_SLOT_GAME_NAME=ActionMoneySlot
ACTION_MONEY_SLOT_LANGUAGE=en
ACTION_MONEY_SLOT_CURRENCY=EUR
ACTION_MONEY_SLOT_TOKEN=<token-real-o-vacío-si-el-backend-lo-permite>
```

### Qué falta para la arquitectura del proveedor

La arquitectura descrita por el proveedor requiere componentes que **no están en este repositorio**:

1. **Laravel/PHP** para el backend del juego
2. **MySQL 5.7+** y el dump de `Addons/MySQL`
3. **PTWebSocket/Server.js** ejecutándose como servicio persistente separado
4. **public/socket_config.json** con el dominio final, sin `www` ni protocolo, si ese archivo existe en el paquete del proveedor

### Orden de despliegue recomendado cuando tengas esos componentes

1. Desplegar/levantar MySQL y cargar el dump de `Addons/MySQL`
2. Desplegar Laravel/PHP con su `.env` real y conexión a MySQL
3. Desplegar el WebSocket Node.js del proveedor (`PTWebSocket/Server.js`) como **otro servicio**
4. Desplegar este frontend apuntando a la URL pública del WebSocket real

### Sobre el WebSocket del proveedor

El texto del proveedor habla de:

- Node.js 12 para algunos juegos
- `PTWebSocket/Server.js`
- `public/socket_config.json`
- puerto `8449`

Pero ninguno de esos archivos existe en este repositorio actual, así que aquí **no se puede**:

- arrancar `PTWebSocket/Server.js`
- configurar PM2
- abrir/validar `8449` desde código del proveedor
- preparar `.env.example` de Laravel ni `composer` porque Laravel no está presente

Cuando el proveedor entregue esos archivos, lo correcto en Railway será separarlos por servicio en lugar de asumir PM2 dentro del mismo contenedor del frontend.

## Validaciones mínimas incluidas

`npm test` comprueba:

- sintaxis de `scripts/start-server.js`
- respuesta HTTP de `/health`
- redirección de `/` a `ActionMoneyEGT/html5/index.html`
- rechazo de path traversal
- ausencia de fallbacks ficticios para host/puerto/token WebSocket

## Limitaciones actuales

- El repositorio por sí solo **no implementa** backend de casino, saldo, créditos ni sesión real.
- El token debe venir del backend real; este repositorio no genera ni persiste tokens.
- Sin Laravel, MySQL o `PTWebSocket/Server.js`, solo puede desplegarse el frontend estático con validación de configuración.
