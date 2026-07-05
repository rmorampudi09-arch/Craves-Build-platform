# Craves Platform

Production-oriented monorepo for Craves: customer web, admin portal, backend API, mobile app skeleton, Azure infrastructure, and Azure DevOps pipelines.

## Apps

- `apps/api` - Node.js TypeScript API
- `apps/customer-web` - Vite React customer web app
- `apps/admin-portal` - Vite React admin portal
- `apps/mobile` - Flutter mobile skeleton
- `infra` - Azure Bicep infrastructure for low-cost starter deployment
- `pipelines` - Azure DevOps YAML pipelines
- `shared` - shared contracts and constants
- `docs` - architecture and deployment notes

## Start locally

```bash
cd apps/api && npm install && npm run dev
cd apps/customer-web && npm install && npm run dev
cd apps/admin-portal && npm install && npm run dev
```

Never commit real secrets. Use `.env` locally and Azure Key Vault / Azure DevOps variable groups in deployment.
