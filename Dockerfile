FROM oven/bun:1 AS app
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY src ./src
COPY static ./static
COPY templates ./templates

ENV NODE_ENV=production
# O Render informa a porta pela variável PORT; 8000 é só o padrão local.
EXPOSE 8000
USER bun
CMD ["bun", "run", "src/server.ts"]
