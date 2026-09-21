FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8080
ENV HOST=0.0.0.0

CMD ["node", "scripts/start-server.js"]
