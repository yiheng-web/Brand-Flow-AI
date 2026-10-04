FROM node:24.19.0-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@10.29.3
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @brand-flow/contracts build && pnpm --filter @brand-flow/web build

FROM nginx:1.28.0-alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
