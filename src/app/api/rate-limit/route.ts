import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { checkDevRateLimit } from "@/lib/feelingsState";

const RATE_LIMIT_PREFIX = "twinkli:rate:";
const RATE_LIMIT_SECONDS = 60 * 60; // 1 hour

const isDev = process.env.NODE_ENV === "development";
const hasKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

/**
 * GET /api/rate-limit
 * Returns the current rate limit status for the client
 */
export async function GET(request: NextRequest) {
  try {
    // Get client IP
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    let remainingSeconds = 0;

    if (isDev && !hasKV) {
      const result = checkDevRateLimit(ip);
      remainingSeconds = result.remainingSeconds;
    } else {
      const rateLimitKey = `${RATE_LIMIT_PREFIX}${ip}`;
      const lastTime = await kv.get<number>(rateLimitKey);
      if (lastTime && Date.now() - lastTime < RATE_LIMIT_SECONDS * 1000) {
        remainingSeconds = Math.ceil(
          (RATE_LIMIT_SECONDS * 1000 - (Date.now() - lastTime)) / 1000
        );
      }
    }

    return NextResponse.json({ remainingSeconds });
  } catch (error) {
    console.error("Error checking rate limit:", error);
    return NextResponse.json({ remainingSeconds: 0 });
  }
}
