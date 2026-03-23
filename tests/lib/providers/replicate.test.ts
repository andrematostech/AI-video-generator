import {
  extractReplicateRetryAfterSeconds,
  normalizeReplicateDurationSeconds
} from "@/lib/providers/replicate";

describe("Replicate provider helpers", () => {
  it("normalizes clip duration to supported values", () => {
    expect(normalizeReplicateDurationSeconds(4)).toBe(5);
    expect(normalizeReplicateDurationSeconds(5)).toBe(5);
    expect(normalizeReplicateDurationSeconds(6)).toBe(5);
    expect(normalizeReplicateDurationSeconds(8)).toBe(10);
    expect(normalizeReplicateDurationSeconds(10)).toBe(10);
  });

  it("extracts retry_after seconds from Replicate throttle errors", () => {
    const retryAfterError = new Error(
      'Request failed with status 429 Too Many Requests: {"detail":"Request was throttled.","status":429,"retry_after":6}'
    );
    const resetWindowError = new Error(
      "Request failed with status 429 Too Many Requests: rate limit resets in ~5s."
    );

    expect(extractReplicateRetryAfterSeconds(retryAfterError)).toBe(6);
    expect(extractReplicateRetryAfterSeconds(resetWindowError)).toBe(5);
    expect(extractReplicateRetryAfterSeconds(new Error("Other error"))).toBeNull();
  });
});
