# Usamos una imagen oficial de Node.js
FROM node:18-alpine

# Establecemos el directorio de trabajo
WORKDIR /app

# Copiamos el package.json primero para aprovechar el caché de Docker
COPY package.json ./

# Instalamos las dependencias
RUN npm install

# Copiamos el resto de los archivos de nuestro proyecto
COPY . .

# Exponemos el puerto 8080
EXPOSE 8080

# Ejecutamos el servidor
CMD ["npm", "start"]
