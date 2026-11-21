# Cueboard in a container, for your own server. compose.yaml runs it with your .env; see README
# "Self-hosting". It listens on every interface inside the container, so it needs CUE_PASSWORD.
FROM node:26-slim
WORKDIR /app
RUN mkdir -p /data && chown node:node /app /data
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --chown=node:node . .
RUN node scripts/build-app.ts
ENV NODE_ENV=production CUE_HOST=0.0.0.0 PORT=5180 CUE_DATA_DIR=/data
# The key that keeps you signed in and your calendar connected across restarts.
VOLUME /data
EXPOSE 5180
HEALTHCHECK --interval=30s --timeout=5s CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "scripts/serve.ts"]
