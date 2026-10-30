# syntax=docker/dockerfile:1
# 단일 컨테이너: express 가 API + Socket.IO + 빌드된 Vue 정적파일을 함께 서빙
# 라즈베리파이(arm64/armv7) 에서 직접 빌드. better-sqlite3 는 prebuilt 바이너리를 받지만
# 없을 경우를 대비해 빌드 스테이지에 컴파일 도구를 둔다.

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY shared/ shared/
COPY server/ server/
COPY client/ client/
RUN npm run build \
 && npm prune --omit=dev \
 && mkdir -p server/node_modules   # 워크스페이스 전용 node_modules 가 없어도 COPY 가 실패하지 않도록

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/csd.sqlite \
    CLIENT_DIST=/app/client/dist
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/migrations ./server/migrations
COPY --from=build /app/server/rules ./server/rules
COPY --from=build /app/client/dist ./client/dist
COPY package.json ./
COPY server/package.json ./server/
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
