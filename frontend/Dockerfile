FROM node:26-alpine3.23 AS builder

WORKDIR /app

ENV EMBER_CLI_DISABLE_ANALYTICS=true

ARG GOOGLE_CLIENT_ID
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID

# Defaults to stripping so an unconfigured build never ships test hooks. Staging
# sets this false to keep data-test-* selectors available for browser testing.
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

EXPOSE 8080
