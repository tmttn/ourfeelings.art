/**
 * Migration script: Regenerate all ribbon paths using Perlin noise
 *
 * This script:
 * 1. Fetches all feelings from Vercel KV
 * 2. Regenerates each path using the feeling's ID as seed (deterministic)
 * 3. Updates all feelings in the database
 *
 * Run with: npx tsx scripts/migrate-ribbon-paths.ts
 *
 * Requires environment variables:
 * - KV_REST_API_URL
 * - KV_REST_API_TOKEN
 */

import { createClient } from "@vercel/kv";
import type { Feeling } from "../src/types";
import { EMOTIONS, generateRibbonPath } from "../src/lib/emotions";

// Get average Y from existing path to preserve approximate vertical position
function getAverageY(path: [number, number][]): number {
  if (!path || path.length === 0) return 0.5;
  const sum = path.reduce((acc, [, y]) => acc + y, 0);
  return sum / path.length;
}

const FEELINGS_KEY = "twinkli:feelings";

async function migrate() {
  // Check for environment variables
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    console.error("Missing environment variables: KV_REST_API_URL and KV_REST_API_TOKEN required");
    console.log("Run with: KV_REST_API_URL=... KV_REST_API_TOKEN=... npx tsx scripts/migrate-ribbon-paths.ts");
    process.exit(1);
  }

  // Create KV client
  const kv = createClient({
    url: kvUrl,
    token: kvToken,
  });

  console.log("Fetching feelings from database...");
  const feelings = await kv.get<Feeling[]>(FEELINGS_KEY);

  if (!feelings || feelings.length === 0) {
    console.log("No feelings found in database. Nothing to migrate.");
    return;
  }

  console.log(`Found ${feelings.length} feelings to migrate.`);

  // Process each feeling
  let migrated = 0;
  let skipped = 0;

  for (const feeling of feelings) {
    const emotion = EMOTIONS.find(e => e.id === feeling.emotionId);

    if (!emotion) {
      console.warn(`  Skipping ${feeling.id}: unknown emotionId "${feeling.emotionId}"`);
      skipped++;
      continue;
    }

    // Use average Y of existing path as the center point
    const startY = getAverageY(feeling.path);

    // Regenerate path using feeling ID as seed
    feeling.path = generateRibbonPath(emotion, startY, feeling.id);
    migrated++;

    if (migrated % 100 === 0) {
      console.log(`  Migrated ${migrated}/${feelings.length}...`);
    }
  }

  console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped.`);
  console.log("Saving to database...");

  await kv.set(FEELINGS_KEY, feelings);

  console.log("Done!");
}

// Run migration
migrate().catch(console.error);
