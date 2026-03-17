import { runDatabaseWrite } from "@/lib/server/database";

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

const GENERATE_WINDOW_MS = 10 * 60 * 1000;
const GENERATE_LIMIT = 5;

export async function consumeGenerateRateLimit(limiterKey: string): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - GENERATE_WINDOW_MS;

  return runDatabaseWrite((store) => {
    store.rateLimitEvents = store.rateLimitEvents.filter(
      (event) => !(event.limiterKey === limiterKey && event.createdAtMs < windowStart)
    );

    const matchingEvents = store.rateLimitEvents
      .filter((event) => event.limiterKey === limiterKey)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);

    const currentCount = matchingEvents.length;

    if (currentCount >= GENERATE_LIMIT) {
      const oldestCreatedAtMs = matchingEvents[0]?.createdAtMs ?? now;
      const retryAfterMs = Math.max(0, oldestCreatedAtMs + GENERATE_WINDOW_MS - now);

      return {
        allowed: false,
        limit: GENERATE_LIMIT,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
      };
    }

    store.counters.rateLimitEventId += 1;
    store.rateLimitEvents.push({
      id: store.counters.rateLimitEventId,
      limiterKey,
      createdAtMs: now
    });

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
