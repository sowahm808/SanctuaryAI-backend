import type { RedisOptions } from "ioredis";

const CONNECT_TIMEOUT_MS = 8_000;

function parseRedisUrl(redisUrl: string): URL {
  const normalized = redisUrl.trim();
  if (!normalized) throw new Error("REDIS_URL is required");
  if (/^(['"]).*\1$/.test(normalized)) throw new Error("REDIS_URL must not include surrounding quotes");
  let parsed: URL;
  try { parsed = new URL(normalized); } catch { throw new Error("REDIS_URL must be a valid Redis URL"); }
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") throw new Error("REDIS_URL must use redis:// or rediss://");
  if (!parsed.hostname) throw new Error("REDIS_URL must include a hostname");
  if (parsed.search || parsed.hash) throw new Error("REDIS_URL must not include query parameters or a fragment");
  const port = Number(parsed.port || 6379);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("REDIS_URL contains an invalid port");
  if (parsed.pathname.length > 1 && !/^\/\d+$/.test(parsed.pathname)) throw new Error("REDIS_URL contains an invalid database number");
  return parsed;
}

function baseOptions(redisUrl: string): RedisOptions {
  const parsed = parseRedisUrl(redisUrl);
  return { host: parsed.hostname, port: Number(parsed.port || 6379), username: parsed.username ? decodeURIComponent(parsed.username) : undefined, password: parsed.password ? decodeURIComponent(parsed.password) : undefined, db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined, tls: parsed.protocol === "rediss:" ? {} : undefined, connectTimeout: CONNECT_TIMEOUT_MS, enableReadyCheck: true };
}

export function createRedisProducerConnection(redisUrl: string): RedisOptions {
  return { ...baseOptions(redisUrl), maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: (times) => times > 3 ? null : Math.min(times * 500, 2_000) };
}

export function createRedisWorkerConnection(redisUrl: string): RedisOptions {
  return { ...baseOptions(redisUrl), maxRetriesPerRequest: null, retryStrategy: (times) => Math.min(times * 500, 2_000) };
}

export const createRedisConnection = createRedisWorkerConnection;

export function redisConnectionDiagnostic(redisUrl: string): { protocol: "redis" | "rediss"; port: number; tlsEnabled: boolean } {
  const parsed = parseRedisUrl(redisUrl);
  return { protocol: parsed.protocol === "rediss:" ? "rediss" : "redis", port: Number(parsed.port || 6379), tlsEnabled: parsed.protocol === "rediss:" };
}

export function redisErrorCategory(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("queue_publish_timeout")) return "QUEUE_PUBLISH_TIMEOUT";
  if (message.includes("auth") || message.includes("wrongpass") || message.includes("noauth")) return "AUTH_ERROR";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DNS_ERROR";
  if (code === "ECONNREFUSED") return "CONNECTION_REFUSED";
  if (code === "ETIMEDOUT" || message.includes("timeout")) return "TIMEOUT";
  if (message.includes("tls") || message.includes("certificate") || message.includes("ssl")) return "TLS_ERROR";
  return "UNKNOWN_ERROR";
}

export function sanitizedRedisErrorMessage(category: string): string { return `Redis queue operation failed (${category})`; }
