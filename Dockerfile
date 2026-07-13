FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Data and uploads should live on a persistent volume in production —
# see README.md for volume mount instructions per host.
RUN mkdir -p data uploads

EXPOSE 3000
CMD ["node", "server.js"]
