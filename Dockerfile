# Image multi-architecture (amd64 pour Synology x86, arm64 pour Raspberry Pi 4/5)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/scolario.db \
    TZ=Europe/Paris
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.js"]
