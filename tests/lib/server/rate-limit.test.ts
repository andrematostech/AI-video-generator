import { consumeGenerateRateLimit } from "@/lib/server/rate-limit";
import { setupTestEnvironment } from "@/tests/helpers/test-env";

describe("consumeGenerateRateLimit", () => {
  it("allows requests until the limit is reached and then blocks", async () => {
    const testEnv = await setupTestEnvironment();

    try {
      const key = "generate:test-client";

      for (let index = 0; index < 5; index += 1) {
        const result = await consumeGenerateRateLimit(key);
        expect(result.allowed).toBe(true);
      }

      const blocked = await consumeGenerateRateLimit(key);

      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      await testEnv.cleanup();
    }
  });
});
