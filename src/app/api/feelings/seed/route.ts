import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import type { Feeling } from "@/types";
import { clearDevFeelings, addDevFeeling, FEELINGS_TTL } from "@/lib/feelingsState";
import { EMOTIONS, generateRibbonPath, getRandomStartY } from "@/lib/emotions";

const isDev = process.env.NODE_ENV === "development";

/**
 * POST /api/feelings/seed
 * Seeds the database with test feelings (dev only)
 */
export async function POST() {
  if (!isDev) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  try {
    // Clear existing feelings
    clearDevFeelings();

    const count = 5000;
    const now = Date.now();
    const sevenDays = FEELINGS_TTL;

    for (let i = 0; i < count; i++) {
      // Random emotion
      const emotion = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];

      // Random age (spread across 7 days for variety in vitality)
      const age = Math.random() * sevenDays;
      const createdAt = now - age;

      // Generate path
      const startY = getRandomStartY();
      const seed = Math.random();
      const path = generateRibbonPath(emotion, startY, seed);

      const feeling: Feeling = {
        id: uuidv4(),
        emotionId: emotion.id,
        color: emotion.color,
        path,
        createdAt,
        expiresAt: createdAt + FEELINGS_TTL,
      };

      addDevFeeling(feeling);
    }

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Error seeding feelings:", error);
    return NextResponse.json(
      { error: "Failed to seed feelings" },
      { status: 500 }
    );
  }
}
