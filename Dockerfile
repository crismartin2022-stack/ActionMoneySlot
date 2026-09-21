FROM node:18-alpine

WORKDIR /app

# Install the static HTTP server before copying the application files.
COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Railway provides PORT at runtime; 8080 is the local/default fallback.
EXPOSE 8080

CMD ["sh", "-c", "npx http-server /app -p ${PORT:-8080} -c-1"]
