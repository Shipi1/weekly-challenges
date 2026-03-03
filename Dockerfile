FROM node:20-slim AS base
RUN corepack enable

# ---- Install dependencies ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM deps AS build
COPY . .
RUN pnpm build

# ---- Production image ----
FROM base AS runtime
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/package.json .
COPY --from=build /app/node_modules ./node_modules

# Create data directory for the JSON file DB
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["node", "build"]
