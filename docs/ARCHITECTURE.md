# Architecture

SanctuaryAI is a stateless NestJS modular monolith. HTTP adapters call application services; Prisma owns persistence; provider interfaces isolate AI, storage, rendering, and social APIs. Workers are deployed separately for BullMQ workloads.

Tenant-owned queries require the organization resolved from the authenticated session. Client organization identifiers are selectors only and must be validated against an active membership. Services include `organizationId` in every owned lookup.

Secrets are validated at startup. Passwords use Argon2id, refresh tokens are opaque and stored as SHA-256 digests, and social tokens use authenticated AES-256-GCM encryption. Logs redact credentials and tokens.
