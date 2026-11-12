# One image for the Atomes server (ADR 0007). Settings come from the environment;
# saved state goes in /data, meant for a persistent volume.
ARG NODE_VERSION=22.23.4
ARG BUN_VERSION=1.4.4

FROM oven/bun:${BUN_VERSION}-alpine AS bun

FROM node:${NODE_VERSION}-alpine AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:${NODE_VERSION}-alpine AS deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:${NODE_VERSION}-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/check-settings.ts /app/scripts/reset-env.ts ./scripts/
COPY --from=build /app/src/lib/server/settings.ts /app/src/lib/server/reset.ts ./src/lib/server/
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 4321
# wget comes with Alpine (BusyBox); shell form so PORT is read at run time.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
# A missing or wrong setting stops the start with a message (scripts/check-settings.ts).
CMD ["sh", "-c", "node scripts/check-settings.ts && exec node dist/server/entry.mjs"]
