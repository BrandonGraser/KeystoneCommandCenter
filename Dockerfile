FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4242
ENV DB_PATH=/data/tasks.sqlite

COPY package.json ./
COPY server.mjs ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /data

EXPOSE 4242

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4242/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
