# syntax=docker/dockerfile:1
# Orylo application image. Build:  docker build -t orylo:local .
# Runtime configuration is ENVIRONMENT ONLY (see .env.example and docs/operations/deployment-contract.md); no secret is baked in.
# Optional build-time CA bundle for networks that re-sign TLS (corporate/CI proxies). Empty by default; supply with
#   docker build --build-context ca=/path/to/dir-with-ca-bundle.crt --build-arg HTTPS_PROXY=... .
FROM scratch AS ca

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=from=ca,target=/ca \
    if [ -f /ca/ca-bundle.crt ]; then export NODE_EXTRA_CA_CERTS=/ca/ca-bundle.crt; fi; \
    npm ci --no-audit --no-fund

FROM deps AS build
WORKDIR /app
COPY . .
# `public/` may be empty (git does not track empty directories); the runtime stage copies it unconditionally.
RUN mkdir -p public
# The build needs no database and no secrets (production secret checks run at runtime, not build time).
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Kept deliberately simple: full node_modules so `tsx scripts/migrate.ts` and `scripts/worker.ts` run from this same image.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/drizzle ./drizzle
COPY docker/entrypoint.sh /usr/local/bin/orylo-entrypoint
RUN chmod +x /usr/local/bin/orylo-entrypoint && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["orylo-entrypoint"]
CMD ["web"]
