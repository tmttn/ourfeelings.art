import type { Feeling } from "@/types";

const FEELINGS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Use global for development to persist across hot reloads
const globalForDev = globalThis as unknown as {
  devFeelings: Feeling[] | undefined;
  devRateLimits: Map<string, number> | undefined;
};

if (!globalForDev.devFeelings) {
  globalForDev.devFeelings = [];
}

if (!globalForDev.devRateLimits) {
  globalForDev.devRateLimits = new Map();
}

export function getDevFeelings(): Feeling[] {
  // Clean up expired feelings
  const now = Date.now();
  globalForDev.devFeelings = globalForDev.devFeelings!.filter(
    (f) => f.expiresAt > now
  );
  return globalForDev.devFeelings;
}

export function addDevFeeling(feeling: Feeling): void {
  globalForDev.devFeelings!.push(feeling);
}

export function updateDevFeeling(updateHash: string, updates: Partial<Pick<Feeling, 'emotionId' | 'color' | 'path' | 'createdAt' | 'expiresAt'>>): Feeling | null {
  const feeling = globalForDev.devFeelings!.find(f => f.updateHash === updateHash);
  if (!feeling) return null;

  Object.assign(feeling, updates);
  return feeling;
}

export function findDevFeelingByHash(updateHash: string): Feeling | null {
  return globalForDev.devFeelings!.find(f => f.updateHash === updateHash) || null;
}

export function clearDevFeelings(): void {
  globalForDev.devFeelings = [];
}

export function clearDevRateLimits(): void {
  globalForDev.devRateLimits = new Map();
}

export function checkDevRateLimit(ip: string): { allowed: boolean; remainingSeconds: number } {
  const now = Date.now();
  const lastTime = globalForDev.devRateLimits!.get(ip);
  const rateLimitMs = 60 * 60 * 1000; // 1 hour

  if (lastTime && now - lastTime < rateLimitMs) {
    return {
      allowed: false,
      remainingSeconds: Math.ceil((rateLimitMs - (now - lastTime)) / 1000),
    };
  }

  return { allowed: true, remainingSeconds: 0 };
}

export function setDevRateLimit(ip: string): void {
  globalForDev.devRateLimits!.set(ip, Date.now());
}

export { FEELINGS_TTL };
