# ActionMoneySlot

Juego estático listo para correr con Node.js y desplegarse en Railway desde GitHub.

## Ejecutar localmente

```bash
npm start
```

Abre `http://localhost:8080`.

## Variables de entorno soportadas

El servidor expone `/runtime-config.js` y el cliente usa esos valores como valores predeterminados en tiempo de ejecución:

- `HOST` - host HTTP del servidor (`0.0.0.0` por defecto)
- `PORT` - puerto HTTP del servidor (`8080` por defecto)
- `ACTION_MONEY_SLOT_TCP_HOST` o `TCP_HOST` - host WebSocket del backend del juego
- `ACTION_MONEY_SLOT_TCP_PORT` o `TCP_PORT` - puerto WebSocket del backend del juego
- `ACTION_MONEY_SLOT_SSL_HOST` o `SSL_HOST` - `true`/`false` para `wss` o `ws`
- `ACTION_MONEY_SLOT_GAME_NAME` o `GAME_NAME` - nombre del juego
- `ACTION_MONEY_SLOT_LANGUAGE` o `LANGUAGE` - idioma inicial
- `ACTION_MONEY_SLOT_CURRENCY` o `CURRENCY` - moneda inicial
- `ACTION_MONEY_SLOT_TOKEN` o `TOKEN` - token inicial

Si no defines backend, se usan como fallback los valores demo embebidos en el proyecto (`mgs-demo.egtmgs.com:8095` con SSL).

## Railway

1. Sube este repositorio a GitHub.
2. Crea un proyecto en Railway conectando el repositorio.
3. Configura las variables de entorno si necesitas otro backend WebSocket.
4. Railway ejecutará `npm start` automáticamente.
5. La healthcheck queda disponible en `/health`.
