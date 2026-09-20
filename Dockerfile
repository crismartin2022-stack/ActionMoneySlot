# Usamos una imagen oficial de Node.js 18
FROM node:18-alpine

# Creamos el directorio de trabajo
WORKDIR /app

# Copiamos el package.json primero
COPY package.json ./

# Instalamos las dependencias
RUN npm install --omit=dev

# Copiamos todo el resto del proyecto
COPY . .

# Expone el puerto 8080
EXPOSE 8080

# Ejecuta el servidor
CMD ["npm", "start"]
