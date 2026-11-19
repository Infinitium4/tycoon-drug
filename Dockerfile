# ---------- 1) Build du jeu (Vite + TypeScript) ----------
# Debian (glibc) pour le build : sur Alpine (musl), le parseur natif de Rollup plante (« Code is nested too deeply »)
FROM node:22-slim AS build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npx tsc && npx vite build

# ---------- 2) Serveur : sert le jeu + le multijoueur (WebSocket) sur le même port ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=2567 \
    GAME_DIR=/app/web
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/server.js server/store.js ./
COPY --from=build /app/client/dist /app/web
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:2567/healthz || exit 1
CMD ["node", "server.js"]
