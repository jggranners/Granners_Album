FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Data and uploaded MP3s both live under data/, so a single persistent
# volume mounted at /app/data in production covers everything that needs
# to survive restarts and redeploys — see README.md for host-specific steps.
RUN mkdir -p data/uploads

EXPOSE 3000
CMD ["node", "server.js"]
