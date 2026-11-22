FROM node:22-slim AS build
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/game ./packages/game
COPY server ./server
# client isn't needed for the api image, but npm workspaces want its package.json
COPY client/package.json ./client/package.json
RUN npm ci
RUN npm run build:game && npx prisma generate --schema server/prisma/schema.prisma && npm run build -w @dicerace/server

FROM node:22-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# apply migrations, then start
CMD ["sh", "-c", "npx prisma migrate deploy --schema server/prisma/schema.prisma && node server/dist/index.js"]
