# Long-lived process, not a serverless function: a cold transport search takes up to 6.3 s
# and a typical function timeout would cut it off mid-flight.
FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json tsconfig.web.json ./
COPY scripts ./scripts
COPY src ./src
COPY fixtures ./fixtures
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    ZAEZD_MODE=live

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
