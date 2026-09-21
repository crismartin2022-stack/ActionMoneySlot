FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY . .

# Default container port; override with `-e PORT=<port>` if needed.
EXPOSE 8080

CMD ["node", "scripts/start-server.js"]
