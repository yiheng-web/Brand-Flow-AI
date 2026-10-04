FROM node:24.19.0-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@10.29.3
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @brand-flow/contracts build && pnpm --filter @brand-flow/agent build && pnpm --filter @brand-flow/api build
RUN pnpm --filter @brand-flow/api deploy --prod --legacy /out

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out .
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
