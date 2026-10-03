# syntax=docker/dockerfile:1
#
# Build context is the monorepo root (see docs/adr/006-persistence-and-
# local-infrastructure.md, "Dockerfile da API e Prisma"):
#   docker build -f apps/api/Dockerfile -t mockp-api .
#
# Multi-stage, hermetic (no network access at runtime), non-root final
# user, pinned Node/Yarn versions in both stages, no dependency on the
# host's node_modules. CMD starts only the API process — migrations are
# never run automatically on boot; see the explicit `migrate deploy`
# command documented in the ADR above.

FROM node:24.18.0-bookworm-slim AS build

RUN corepack enable && corepack prepare yarn@4.12.0 --activate

WORKDIR /app

# Workspace graph metadata only, for a cache-friendly install layer —
# Yarn Berry needs every workspace's package.json to resolve
# `yarn install --immutable` correctly, not just the root's. That means
# the *whole* workspace graph recorded in yarn.lock (apps/api,
# apps/worker, libs/config, libs/queue): a missing workspace fails the
# install (`@mockp/queue` not found) or would modify the lockfile.
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY libs/config/package.json ./libs/config/package.json
COPY libs/queue/package.json ./libs/queue/package.json

RUN HUSKY=0 yarn install --immutable

# Rest of the source needed to build the API and its workspace
# dependencies (libs/config, libs/queue).
COPY tsconfig.json tsconfig.base.json nx.json ./
COPY apps/api/tsconfig*.json ./apps/api/
COPY apps/api/src ./apps/api/src
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma*.config.ts ./apps/api/
COPY libs/config/tsconfig*.json ./libs/config/
COPY libs/config/src ./libs/config/src
# libs/config's own build target copies *.md as build assets
# (libs/config/package.json, nx.targets.build.options.assets).
COPY libs/config/*.md ./libs/config/
COPY libs/queue/tsconfig*.json ./libs/queue/
COPY libs/queue/src ./libs/queue/src
# Same for libs/queue (nx.targets.build.options.assets: libs/queue/*.md).
COPY libs/queue/*.md ./libs/queue/

# Triggers, in order (via Nx's dependsOn graph): libs/config's own
# build, libs/queue's own build, `api:db:generate` (prisma.config.ts is schema-only — no
# DATABASE_URL needed here), then the API's tsc compile.
RUN yarn nx run api:build


FROM node:24.18.0-bookworm-slim AS runtime

# Corepack's downloaded release cache lives under $HOME by default
# (root's here, since USER node is set later) — the `node` user would
# otherwise re-download the exact same yarn@4.12.0 release on its first
# invocation, silently reaching the network at container *runtime*, not
# just at build time. A fixed, world-readable COREPACK_HOME shared by
# both users closes that gap.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

WORKDIR /app

# Workspace metadata — required for `yarn workspace api ...` (used by
# the explicit `migrate deploy` command below) to resolve which
# directory is the `api` workspace.
COPY --from=build --chown=node:node /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=node:node /app/libs/config/package.json ./libs/config/package.json
COPY --from=build --chown=node:node /app/libs/queue/package.json ./libs/queue/package.json

# Full node_modules from the build stage — already includes the
# `prisma` CLI (a runtime `dependency` of apps/api, not a devDependency,
# specifically so `migrate deploy` can run from this very image with no
# network access) and the `@mockp/config` workspace symlink, which
# resolves to ./libs/config below.
COPY --from=build --chown=node:node /app/node_modules ./node_modules

# `@mockp/config`'s package.json "exports" map points "./server" at
# "./dist/src/server/index.js" *relative to libs/config/package.json* —
# the workspace symlink above (`node_modules/@mockp/config` ->
# `/app/libs/config`) only resolves at runtime if this directory has
# that compiled output physically present. Not enumerated by the ADR's
# copy list — added here because both `main.ts` and every module that
# imports `@mockp/config/server` require it; without it the image
# fails at startup with a module-not-found error.
COPY --from=build --chown=node:node /app/libs/config/dist ./libs/config/dist

# Same for `@mockp/queue` ("exports" default -> ./dist/src/index.js
# relative to libs/queue/package.json), imported by apps/api/src/queue.
COPY --from=build --chown=node:node /app/libs/queue/dist ./libs/queue/dist

# Compiled API (tsc mirrors apps/api/src, including the generated
# Prisma Client under src/generated/prisma-client — no separate copy
# step needed for it).
COPY --from=build --chown=node:node /app/dist/apps/api ./dist/apps/api

# Minimal Prisma files required for `yarn workspace api prisma migrate
# deploy --config prisma.migrate.config.ts` to run inside this image —
# see docs/adr/006-persistence-and-local-infrastructure.md, "Dockerfile
# da API e Prisma". `prisma.test.config.ts`, `prisma/seed.ts` and any
# test file are deliberately excluded — never part of this image.
COPY --from=build --chown=node:node /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build --chown=node:node /app/apps/api/prisma.migrate.config.ts ./apps/api/prisma.migrate.config.ts
COPY --from=build --chown=node:node /app/apps/api/prisma/prisma-config.shared.ts ./apps/api/prisma/prisma-config.shared.ts
COPY --from=build --chown=node:node /app/apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma
COPY --from=build --chown=node:node /app/apps/api/prisma/migrations ./apps/api/prisma/migrations

# WORKDIR created /app as root:root; the individual --chown=node:node
# COPY instructions above only cover their own targets, not this
# directory entry itself. Without this, Yarn's `migrate deploy` command
# fails with EACCES trying to create /app/.yarn (its per-project state
# dir) as the node user.
RUN chown node:node /app

USER node

CMD ["node", "dist/apps/api/src/main.js"]
