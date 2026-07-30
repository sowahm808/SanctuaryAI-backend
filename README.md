# SanctuaryAI Backend

Production-oriented NestJS/PostgreSQL foundation for SanctuaryAI's multi-tenant ministry content platform.

## Local setup

1. Install Node.js 22 and run `npm ci`.
2. Copy `.env.example` to `.env` and replace every secret.
3. Run `docker compose up -d postgres redis`.
4. Run `npm run prisma:generate`, `npm run migrate:deploy`, and `npm run seed`.
5. Start with `npm run start:dev`. Swagger is at `http://localhost:3000/docs`; health is at `/api/v1/health`.

Run `npm run build`, `npm run lint`, `npm test`, and `npm run prisma:validate`. Production deploys should run migrations as a one-off release task before horizontally scaling stateless processes.

## Security

Never commit `.env`. Use a secret manager and external PostgreSQL, Redis, and object storage. Tenant context must come from a verified membership, never directly from a request body. See [architecture](docs/ARCHITECTURE.md).
