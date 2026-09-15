FROM node:24-alpine AS dependencies
WORKDIR /workspace/apps/delivery-intelligence-admin
COPY apps/delivery-intelligence-admin/package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

FROM node:24-alpine AS builder
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /workspace/apps/delivery-intelligence-admin/node_modules ./apps/delivery-intelligence-admin/node_modules
COPY apps/delivery-intelligence-admin ./apps/delivery-intelligence-admin
COPY apps/customer-web-next/scripts/assets ./apps/customer-web-next/scripts/assets
RUN cd apps/delivery-intelligence-admin && npm run build

FROM node:24-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
WORKDIR /app/apps/delivery-intelligence-admin
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/delivery-intelligence-admin/.next/standalone /app
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/delivery-intelligence-admin/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/delivery-intelligence-admin/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
