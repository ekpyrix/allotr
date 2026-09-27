# syntax=docker/dockerfile:1.10
# One multi-arch image (ADR 0007): s6-overlay supervises the server and the
# gateway. Node runs the TypeScript sources directly, so there is no compile
# step for them; only the web app is built.

ARG NODE_IMAGE=node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
RUN corepack enable pnpm
WORKDIR /app

# Web app build, with all dependencies.
FROM base AS web
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@allotr/web..." \
 && pnpm --filter @allotr/web build

# Production dependencies for the server and gateway only.
FROM base AS runtime
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod \
      --filter "@allotr/server..." --filter "@allotr/gateway..." \
 && rm -rf apps/web apps/cli scripts deploy/.env.example
COPY --from=web /app/apps/web/dist apps/web/dist

# s6-overlay, verified against pinned checksums.
FROM ${NODE_IMAGE} AS s6
ARG S6_OVERLAY_VERSION=3.2.3.2
ARG TARGETARCH
ADD --checksum=sha256:5379750ed30a84bbd2e2dd74847ba6b5bd29cd0b2e3ea2ec58049b57eb2eda12 \
    https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp/
ADD --checksum=sha256:e6befcc96a437a3831386ecfc51808c5d3e939dc5fe3c02ae9284599e8aa2408 \
    https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz /tmp/
ADD --checksum=sha256:b17f17a82e7a515c682a91edaf2ffdabb73f891981b6c1fd712115693a2f8b4c \
    https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-aarch64.tar.xz /tmp/
# Build-only stage: the unpinned xz-utils never reaches the final image.
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends xz-utils \
 && mkdir /s6root \
 && tar -C /s6root -Jxpf /tmp/s6-overlay-noarch.tar.xz \
 && case "${TARGETARCH}" in \
      amd64) arch=x86_64 ;; \
      arm64) arch=aarch64 ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
 && tar -C /s6root -Jxpf "/tmp/s6-overlay-${arch}.tar.xz"

FROM ${NODE_IMAGE}
LABEL org.opencontainers.image.title="Allotr" \
      org.opencontainers.image.description="Self-hosted personal finance ledger" \
      org.opencontainers.image.source="https://github.com/fnnyx/allotr" \
      org.opencontainers.image.licenses="MIT"

COPY --from=s6 /s6root/ /
COPY deploy/s6/s6-rc.d /etc/s6-overlay/s6-rc.d
COPY deploy/s6/user-bundles.d /etc/s6-overlay/user-bundles.d
COPY --from=runtime /app /app

# Runs as the image's unprivileged `node` user (uid 1000). s6-overlay needs
# /run writable by that user; /data holds the database and backups.
RUN mkdir -p /data \
 && chown node:node /data /run

ENV NODE_ENV=production \
    ALLOTR_ROLE=all \
    ALLOTR_HOST=0.0.0.0 \
    ALLOTR_PORT=8080 \
    ALLOTR_DATABASE_PATH=/data/allotr.db \
    S6_BEHAVIOUR_IF_STAGE2_FAILS=2 \
    S6_VERBOSITY=1

USER 1000:1000
WORKDIR /app
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "/app/deploy/healthcheck.ts"]
ENTRYPOINT ["/init"]
