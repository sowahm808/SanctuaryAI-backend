const Redis = require("ioredis");

function category(error) {
  const code = error && typeof error === "object" ? String(error.code || "") : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("auth") || message.includes("wrongpass")) return "AUTH_ERROR";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DNS_ERROR";
  if (code === "ECONNREFUSED") return "CONNECTION_REFUSED";
  if (code === "ETIMEDOUT" || message.includes("timeout")) return "TIMEOUT";
  if (message.includes("tls") || message.includes("certificate")) return "TLS_ERROR";
  return "UNKNOWN_ERROR";
}

async function main() {
  const url = process.env.REDIS_URL && process.env.REDIS_URL.trim();
  if (!url) { console.error("Redis ping failed: REDIS_URL_MISSING"); process.exitCode = 1; return; }
  let redis;
  try {
    if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) throw new Error("invalid URL");
    redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 8_000, lazyConnect: true, retryStrategy: (times) => times > 1 ? null : 500 });
    const operation = (async () => { await redis.connect(); return redis.ping(); })();
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), 10_000); timer.unref(); });
    const response = await Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
    if (response !== "PONG") throw new Error("unexpected response");
    console.log("Redis ping: PONG");
  } catch (error) {
    console.error(`Redis ping failed: ${category(error)}`);
    process.exitCode = 1;
  } finally { if (redis) redis.disconnect(); }
}

void main();
