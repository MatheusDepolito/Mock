# syntax=docker/dockerfile:1
#
# Build context is the monorepo root (same convention as
# apps/api/Dockerfile, the direct reference for this file):
#   docker build -f apps/worker/Dockerfile -t mockp-worker .
#
# Multi-stage, hermetic (no network access at runtime), non-root final
# user, pinned Node/Yarn versions in both stages, no dependency on the
# host's node_modules. CMD starts only the worker process. The worker
# never imports Prisma or anything from apps/api (docs/adr/006, "Prisma
# Client e fronteira com o worker"); the full workspace node_modules is
# copied for simplicity, so Prisma-related packages may be physically
# present in the image but are never loaded by the worker.

FROM node:24.18.0-bookworm-slim AS build

RUN corepack enable && corepack prepare yarn@4.12.0 --activate

WORKDIR /app

# Workspace graph metadata only, for a cache-friendly install layer —
# `yarn install --immutable` needs every workspace recorded in yarn.lock
# (apps/api, apps/worker, libs/api-client, libs/config, libs/queue), not
# just the ones the worker uses; a missing one fails the install or would
# modify the lockfile.
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY libs/api-client/package.json ./libs/api-client/package.json
COPY libs/config/package.json ./libs/config/package.json
COPY libs/queue/package.json ./libs/queue/package.json

RUN HUSKY=0 yarn install --immutable

# Sources needed to build the worker and its workspace dependencies
# (libs/config, libs/queue). Nothing from apps/api beyond package.json.
COPY tsconfig.json tsconfig.base.json nx.json ./
COPY apps/worker/tsconfig*.json ./apps/worker/
COPY apps/worker/src ./apps/worker/src
COPY libs/config/tsconfig*.json ./libs/config/
COPY libs/config/src ./libs/config/src
# Both libs' build targets copy *.md as build assets
# (nx.targets.build.options.assets in each package.json).
COPY libs/config/*.md ./libs/config/
COPY libs/queue/tsconfig*.json ./libs/queue/
COPY libs/queue/src ./libs/queue/src
COPY libs/queue/*.md ./libs/queue/

# Builds libs/config and libs/queue first (Nx dependsOn graph), then the
# worker's tsc compile.
RUN yarn nx run worker:build


FROM node:24.18.0-bookworm-slim AS runtime

# Fixed, world-readable Corepack cache — see apps/api/Dockerfile for the
# reason (avoids a network download at container runtime).
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=node:node /app/libs/api-client/package.json ./libs/api-client/package.json
COPY --from=build --chown=node:node /app/libs/config/package.json ./libs/config/package.json
COPY --from=build --chown=node:node /app/libs/queue/package.json ./libs/queue/package.json

# Full node_modules from the build stage, including the workspace
# symlinks for @mockp/config and @mockp/queue (resolved to ./libs/*).
COPY --from=build --chown=node:node /app/node_modules ./node_modules

# Compiled output of both workspace libs, required by their package.json
# "exports" maps at runtime.
COPY --from=build --chown=node:node /app/libs/config/dist ./libs/config/dist
COPY --from=build --chown=node:node /app/libs/queue/dist ./libs/queue/dist

# Compiled worker.
COPY --from=build --chown=node:node /app/dist/apps/worker ./dist/apps/worker

RUN chown node:node /app

USER node

CMD ["node", "dist/apps/worker/src/main.js"]
