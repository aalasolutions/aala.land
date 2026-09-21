FROM node:26-alpine3.23 AS builder

WORKDIR /app

ENV EMBER_CLI_DISABLE_ANALYTICS=true

ARG GOOGLE_CLIENT_ID
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID

# Defaults to stripping data-test-* selectors so an unconfigured build never
# ships test hooks. Staging sets this false at build time so the selectors
# survive for browser verification. Build-time only: any deploy that omits
# this flag silently reverts to stripping.
ARG STRIP_TEST_SELECTORS=true
ENV STRIP_TEST_SELECTORS=$STRIP_TEST_SELECTORS

RUN npm install -g pnpm@10

# The kit is a workspace package; pnpm needs the workspace manifest and the
# addon's package.json before it can resolve `@nuvoui/ember: workspace:*`.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nuvoui/package.json ./nuvoui/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/ /usr/share/nginx/html/

USER 101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
