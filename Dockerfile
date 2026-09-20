# Usamos una imagen oficial de Node.js
FROM node:18-alpine

# Establecemos el directorio de trabajo en el contenedor
WORKDIR /app

# Copiamos el package.json primero para aprovechar el caché de Docker
COPY package.json ./

# Instalamos las dependencias
RUN npm install

# Copiamos el resto de los archivos de nuestro proyecto
COPY . .

# Exponemos el puerto 8080 (aunque Railway se encargará de redirigir)
EXPOSE 8080

# El comando más importante: Iniciamos el servidor directamente con node
# y nos aseguramos de que escuche en 0.0.0.0 (todas las interfaces de red)
CMD ["node", "node_modules/http-server/bin/http-server", "-p", "8080", "-c-1", "-a", "0.0.0.0"]
