FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY shared/comercial/package.json ./shared/comercial/package.json
RUN npm ci --workspace @comercialapp/frontend --workspace @comercialapp/rules --include-workspace-root=false

COPY shared ./shared
COPY frontend ./frontend
RUN npm run build --workspace @comercialapp/rules \
  && npm run build --workspace @comercialapp/frontend

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
