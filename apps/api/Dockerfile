# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts --cache /tmp/npm-cache --no-audit --no-fund

FROM deps AS build
COPY apps/api apps/api
RUN npm run build -w @recruit/api

FROM deps AS production-deps
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY --from=production-deps /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
CMD ["npm", "run", "start", "-w", "@recruit/api"]
