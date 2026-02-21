const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const CLEANUP_INTERVAL_MS = 60_000;

const requestTimestampsByUserId = new Map<string, number[]>();
let lastCleanupAt = Date.now();

function getRecentTimestamps(timestamps: number[], now: number): number[] {
  return timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);
}

function cleanupOldEntries(now: number): void {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  for (const [userId, timestamps] of requestTimestampsByUserId) {
    const recentTimestamps = getRecentTimestamps(timestamps, now);

    if (recentTimestamps.length === 0) {
      requestTimestampsByUserId.delete(userId);
      continue;
    }

    requestTimestampsByUserId.set(userId, recentTimestamps);
  }

  lastCleanupAt = now;
}

// Sliding window rate limiter: 60 requests per minute per userId.
export function checkRateLimit(
  userId: string,
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  cleanupOldEntries(now);

  const timestamps = requestTimestampsByUserId.get(userId) ?? [];
  const recentTimestamps = getRecentTimestamps(timestamps, now);

  if (recentTimestamps.length >= MAX_REQUESTS) {
    requestTimestampsByUserId.set(userId, recentTimestamps);

    const oldestTimestamp = recentTimestamps[0];
    const retryAfter = Math.max(
      1,
      Math.ceil((oldestTimestamp + WINDOW_MS - now) / 1000),
    );

    return { allowed: false, retryAfter };
  }

  recentTimestamps.push(now);
  requestTimestampsByUserId.set(userId, recentTimestamps);

  return { allowed: true };
}
