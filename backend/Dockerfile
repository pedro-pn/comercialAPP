FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates libreoffice-writer python3-uno fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY shared/comercial/package.json ./shared/comercial/package.json
RUN npm ci --workspace @comercialapp/backend --workspace @comercialapp/rules --include-workspace-root=false

COPY shared ./shared
COPY backend/prisma.config.ts ./backend/prisma.config.ts
COPY backend/prisma ./backend/prisma
COPY backend/src ./backend/src
COPY backend/models ./backend/models
COPY backend/scripts ./backend/scripts
RUN npm run build --workspace @comercialapp/rules
RUN npm run db:generate --workspace @comercialapp/backend

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 4300

CMD ["sh", "-c", "npm run db:migrate && exec node src/server.js"]
