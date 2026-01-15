import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { v4 as uuidv4 } from "uuid";
import type { Feeling } from "@/types";
import {
  getDevFeelings,
  addDevFeeling,
  updateDevFeeling,
  clearDevFeelings,
  clearDevRateLimits,
  checkDevRateLimit,
  setDevRateLimit,
  getClientIP,
  FEELINGS_TTL,
} from "@/lib/feelingsState";
import { EMOTIONS, generateRibbonPath, getRandomStartY } from "@/lib/emotions";

const FEELINGS_KEY = "twinkli:feelings";
const RATE_LIMIT_PREFIX = "twinkli:rate:";
const RATE_LIMIT_SECONDS = 60 * 60; // 1 hour

const isDev = process.env.NODE_ENV === "development";
const hasKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

// Simple hash for ETag generation
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * GET /api/feelings
 * Returns all active (non-expired) feelings
 * - Strips updateHash (private to creator)
 * - Strips emotionId (redundant with color)
 * - Supports ETag caching to reduce bandwidth
 */
export async function GET(request: NextRequest) {
  try {
    let feelings: Feeling[];

    if (isDev && !hasKV) {
      feelings = getDevFeelings();
    } else {
      const stored = await kv.get<Feeling[]>(FEELINGS_KEY);
      const now = Date.now();
      feelings = (stored || []).filter((f) => f.expiresAt > now);
    }

    // Strip private/redundant fields for response
    // updateHash is secret, emotionId is redundant (we have color)
    // expiresAt isn't needed client-side (we calculate age from createdAt)
    const publicFeelings = feelings.map(({ updateHash, emotionId, expiresAt, ...rest }) => rest);

    // Generate ETag based on feeling IDs and count (fast, stable)
    const etagSource = `${publicFeelings.length}:${publicFeelings.map(f => f.id).join(',')}`;
    const etag = `"${simpleHash(etagSource)}"`;

    // Check If-None-Match header for caching
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag },
      });
    }

    return NextResponse.json(
      { feelings: publicFeelings },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "private, max-age=5", // Allow 5s browser cache
        },
      }
    );
  } catch (error) {
    console.error("Error fetching feelings:", error);
    return NextResponse.json({ feelings: [] });
  }
}

/**
 * POST /api/feelings
 * Creates a new feeling from an emotion selection
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emotionId } = body;

    // Find the emotion
    const emotion = EMOTIONS.find((e) => e.id === emotionId);
    if (!emotion) {
      return NextResponse.json({ error: "Invalid emotion" }, { status: 400 });
    }

    // Get client IP for rate limiting
    const ip = getClientIP(request);

    // Check rate limit
    if (isDev && !hasKV) {
      const { allowed, remainingSeconds } = checkDevRateLimit(ip);
      if (!allowed) {
        return NextResponse.json(
          { error: "Rate limited", remainingSeconds },
          { status: 429 }
        );
      }
    } else {
      const rateLimitKey = `${RATE_LIMIT_PREFIX}${ip}`;
      const lastTime = await kv.get<number>(rateLimitKey);
      if (lastTime && Date.now() - lastTime < RATE_LIMIT_SECONDS * 1000) {
        const remainingSeconds = Math.ceil(
          (RATE_LIMIT_SECONDS * 1000 - (Date.now() - lastTime)) / 1000
        );
        return NextResponse.json(
          { error: "Rate limited", remainingSeconds },
          { status: 429 }
        );
      }
    }

    // Create the feeling with an update hash for the creator
    const now = Date.now();
    const updateHash = uuidv4(); // Secret token only the creator knows
    const id = uuidv4();

    // Generate the ribbon path based on the emotion
    // Use the feeling ID as seed for deterministic, reproducible paths
    const startY = getRandomStartY();
    const path = generateRibbonPath(emotion, startY, id);

    const feeling: Feeling = {
      id,
      emotionId: emotion.id,
      color: emotion.color,
      path,
      createdAt: now,
      expiresAt: now + FEELINGS_TTL,
      updateHash,
    };

    // Save feeling and update rate limit
    if (isDev && !hasKV) {
      addDevFeeling(feeling);
      setDevRateLimit(ip);
    } else {
      // Get existing feelings and filter expired ones
      const stored = await kv.get<Feeling[]>(FEELINGS_KEY);
      const feelings = (stored || []).filter((f) => f.expiresAt > now);
      feelings.push(feeling);

      // Save updated feelings list
      await kv.set(FEELINGS_KEY, feelings);

      // Set rate limit
      await kv.set(`${RATE_LIMIT_PREFIX}${ip}`, now, { ex: RATE_LIMIT_SECONDS });
    }

    return NextResponse.json({ success: true, feeling, remainingSeconds: RATE_LIMIT_SECONDS });
  } catch (error) {
    console.error("Error creating feeling:", error);
    return NextResponse.json(
      { error: "Failed to create feeling" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/feelings
 * Updates an existing feeling (refreshes its lifespan)
 * Requires the updateHash that was returned when creating the feeling
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { updateHash, emotionId } = body;

    if (!updateHash) {
      return NextResponse.json({ error: "Missing updateHash" }, { status: 400 });
    }

    // Find the emotion
    const emotion = EMOTIONS.find((e) => e.id === emotionId);
    if (!emotion) {
      return NextResponse.json({ error: "Invalid emotion" }, { status: 400 });
    }

    // Get client IP for rate limiting
    const ip = getClientIP(request);

    // Check rate limit (same as POST)
    if (isDev && !hasKV) {
      const { allowed, remainingSeconds } = checkDevRateLimit(ip);
      if (!allowed) {
        return NextResponse.json(
          { error: "Rate limited", remainingSeconds },
          { status: 429 }
        );
      }
    } else {
      const rateLimitKey = `${RATE_LIMIT_PREFIX}${ip}`;
      const lastTime = await kv.get<number>(rateLimitKey);
      if (lastTime && Date.now() - lastTime < RATE_LIMIT_SECONDS * 1000) {
        const remainingSeconds = Math.ceil(
          (RATE_LIMIT_SECONDS * 1000 - (Date.now() - lastTime)) / 1000
        );
        return NextResponse.json(
          { error: "Rate limited", remainingSeconds },
          { status: 429 }
        );
      }
    }

    const now = Date.now();
    let updatedFeeling: Feeling | null = null;

    if (isDev && !hasKV) {
      // Find the feeling first to get its ID for deterministic path generation
      const feelings = getDevFeelings();
      const existingFeeling = feelings.find((f) => f.updateHash === updateHash);
      if (existingFeeling) {
        // Generate new ribbon path using existing ID as seed
        const startY = getRandomStartY();
        const path = generateRibbonPath(emotion, startY, existingFeeling.id);

        updatedFeeling = updateDevFeeling(updateHash, {
          emotionId: emotion.id,
          color: emotion.color,
          path,
          createdAt: now, // Reset lifespan
          expiresAt: now + FEELINGS_TTL,
        });
        if (updatedFeeling) {
          setDevRateLimit(ip);
        }
      }
    } else {
      // Get existing feelings
      const stored = await kv.get<Feeling[]>(FEELINGS_KEY);
      const feelings = (stored || []).filter((f) => f.expiresAt > now);

      // Find and update the feeling
      const idx = feelings.findIndex((f) => f.updateHash === updateHash);
      if (idx !== -1) {
        // Generate new ribbon path using existing ID as seed
        const startY = getRandomStartY();
        const path = generateRibbonPath(emotion, startY, feelings[idx].id);

        feelings[idx] = {
          ...feelings[idx],
          emotionId: emotion.id,
          color: emotion.color,
          path,
          createdAt: now,
          expiresAt: now + FEELINGS_TTL,
        };
        updatedFeeling = feelings[idx];

        // Save updated feelings list
        await kv.set(FEELINGS_KEY, feelings);

        // Set rate limit
        await kv.set(`${RATE_LIMIT_PREFIX}${ip}`, now, { ex: RATE_LIMIT_SECONDS });
      }
    }

    if (!updatedFeeling) {
      return NextResponse.json({ error: "Feeling not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, feeling: updatedFeeling, remainingSeconds: RATE_LIMIT_SECONDS });
  } catch (error) {
    console.error("Error updating feeling:", error);
    return NextResponse.json(
      { error: "Failed to update feeling" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/feelings
 * Clears all feelings (dev only)
 */
export async function DELETE() {
  if (!isDev) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  try {
    if (isDev && !hasKV) {
      clearDevFeelings();
      clearDevRateLimits();
    } else {
      await kv.del(FEELINGS_KEY);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error clearing feelings:", error);
    return NextResponse.json(
      { error: "Failed to clear feelings" },
      { status: 500 }
    );
  }
}
