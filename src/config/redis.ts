import type { RedisOptions } from "ioredis";

export function createRedisConnection(redisUrl: string): RedisOptions {
  const normalized = redisUrl.trim();
  if (!normalized) throw new Error("REDIS_URL is required");
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    throw new Error("REDIS_URL must not include surrounding quotes");
  }

  let parsed: URL;
  try { parsed = new URL(normalized); } catch { throw new Error("REDIS_URL must be a valid Redis URL"); }
  if (!["redis:", "rediss:"].includes(parsed.protocol)) throw new Error("REDIS_URL must use redis:// or rediss://");
  if (!parsed.hostname) throw new Error("REDIS_URL must include a hostname");
  const port = Number(parsed.port || 6379);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("REDIS_URL contains an invalid port");

  return {
    host: parsed.hostname,
    port,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 10_000,
  };
}

export function redisErrorCategory(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("auth") || message.includes("wrongpass")) return "AUTH_ERROR";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DNS_ERROR";
  if (code === "ECONNREFUSED") return "CONNECTION_REFUSED";
  if (code === "ETIMEDOUT" || message.includes("timeout")) return "TIMEOUT";
  if (message.includes("tls") || message.includes("certificate")) return "TLS_ERROR";
  return "UNKNOWN_ERROR";
}
