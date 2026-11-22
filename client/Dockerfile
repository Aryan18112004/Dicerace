FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/game ./packages/game
COPY client ./client
COPY server/package.json ./server/package.json
RUN npm ci
RUN npm run build:game && npm run build -w @dicerace/client

FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
