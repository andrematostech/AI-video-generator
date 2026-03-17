import { mapRows, runDatabaseWrite } from "@/lib/server/database";

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

const GENERATE_WINDOW_MS = 10 * 60 * 1000;
const GENERATE_LIMIT = 5;

type CountRow = {
  count: number;
};

type MinRow = {
  oldest_created_at_ms: number | null;
};

export async function consumeGenerateRateLimit(limiterKey: string): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - GENERATE_WINDOW_MS;

  return runDatabaseWrite((db) => {
    db.run(
      "DELETE FROM rate_limit_events WHERE limiter_key = ? AND created_at_ms < ?",
      [limiterKey, windowStart]
    );

    const countRow = mapRows<CountRow>(
      db,
      "SELECT COUNT(*) AS count FROM rate_limit_events WHERE limiter_key = ?",
      [limiterKey]
    )[0];

    const currentCount = Number(countRow?.count ?? 0);

    if (currentCount >= GENERATE_LIMIT) {
      const oldestRow = mapRows<MinRow>(
        db,
        "SELECT MIN(created_at_ms) AS oldest_created_at_ms FROM rate_limit_events WHERE limiter_key = ?",
        [limiterKey]
      )[0];

      const oldestCreatedAtMs = Number(oldestRow?.oldest_created_at_ms ?? now);
      const retryAfterMs = Math.max(0, oldestCreatedAtMs + GENERATE_WINDOW_MS - now);

      return {
        allowed: false,
        limit: GENERATE_LIMIT,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
      };
    }

    db.run(
      "INSERT INTO rate_limit_events (limiter_key, created_at_ms) VALUES (?, ?)",
      [limiterKey, now]
    );

    return {
      allowed: true,
      limit: GENERATE_LIMIT,
      remaining: Math.max(0, GENERATE_LIMIT - currentCount - 1),
      retryAfterSeconds: 0
    };
  });
}

export function getRateLimitKeyFromRequestHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");
  const candidate = forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "local";

  return `generate:${candidate}`;
}
