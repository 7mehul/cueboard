# The hosted test version. Render (render.yaml) or any host that runs a container:
# it listens on $PORT and needs ANTHROPIC_API_KEY, CUE_INVITES and CUE_SECRET.
FROM node:26-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "scripts/serve.ts", "--hosted"]
