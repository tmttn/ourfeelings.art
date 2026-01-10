import type { Feeling } from "@/types";
import { NextRequest } from "next/server";

const FEELINGS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Get client IP from request headers
 * Prioritizes x-real-ip (Vercel's direct client IP) over x-forwarded-for
 * Normalizes IPv6 localhost to IPv4 for consistency
 */
export function getClientIP(request: NextRequest): string {
  // Vercel provides x-real-ip as the most reliable client IP
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return normalizeIP(realIP.trim());
  }

  // Fallback to x-forwarded-for (first IP in chain is the client)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIP = forwarded.split(",")[0].trim();
    return normalizeIP(firstIP);
  }

  return "unknown";
}

/**
 * Normalize IP address for consistent comparison
 * - Maps IPv6 localhost (::1) to IPv4 (127.0.0.1)
 * - Strips IPv6 zone identifiers
 */
function normalizeIP(ip: string): string {
  // Handle IPv6 localhost
  if (ip === "::1" || ip === "::ffff:127.0.0.1") {
    return "127.0.0.1";
  }

  // Strip IPv6 zone identifier (e.g., "fe80::1%eth0" -> "fe80::1")
  const zoneIndex = ip.indexOf("%");
  if (zoneIndex !== -1) {
    return ip.substring(0, zoneIndex);
  }

  return ip;
}

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
