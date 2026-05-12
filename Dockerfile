FROM node:20-bookworm-slim

WORKDIR /app

# System deps for sharp + tesseract
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm install -D typescript tsx && npm run build && npm prune --omit=dev

# Persistent volumes
VOLUME ["/app/sessions", "/app/database", "/app/logs", "/app/media"]

EXPOSE 3000

CMD ["node", "dist/index.js"]
