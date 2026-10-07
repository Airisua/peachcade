FROM node:22-slim AS deps
WORKDIR /app
# Build tools are only needed as a fallback when the better-sqlite3 prebuilt
# binary cannot be downloaded, so the produced image itself stays slim.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p data public/uploads
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(function(r){process.exit(r.ok?0:1)}).catch(function(){process.exit(1)})"
CMD ["node", "server.js"]
