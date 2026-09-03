FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.html styles.css script.js roadmap.json server.js ./

EXPOSE 3000
CMD ["node", "server.js"]
