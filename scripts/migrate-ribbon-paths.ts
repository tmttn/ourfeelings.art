/**
 * Migration script: Regenerate all ribbon paths using the new Bézier spline algorithm
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

// Copy the emotion definitions (to avoid Next.js module resolution issues)
interface Emotion {
  id: string;
  label: string;
  color: string;
  controlPoints: [number, number];
  amplitude: number;
  flowSpeed: number;
}

const EMOTIONS: Emotion[] = [
  { id: "joy", label: "joyful", color: "#facc15", controlPoints: [7, 8], amplitude: 0.25, flowSpeed: 1.2 },
  { id: "calm", label: "calm", color: "#2dd4bf", controlPoints: [3, 4], amplitude: 0.18, flowSpeed: 0.7 },
  { id: "love", label: "loving", color: "#f472b6", controlPoints: [5, 6], amplitude: 0.20, flowSpeed: 0.9 },
  { id: "hope", label: "hopeful", color: "#38bdf8", controlPoints: [5, 6], amplitude: 0.20, flowSpeed: 1.0 },
  { id: "melancholy", label: "melancholic", color: "#8b5cf6", controlPoints: [4, 5], amplitude: 0.18, flowSpeed: 0.5 },
  { id: "anxious", label: "anxious", color: "#fb923c", controlPoints: [10, 12], amplitude: 0.30, flowSpeed: 1.5 },
  { id: "angry", label: "angry", color: "#ef4444", controlPoints: [12, 14], amplitude: 0.35, flowSpeed: 1.8 },
  { id: "worn", label: "worn", color: "#94a3b8", controlPoints: [3, 4], amplitude: 0.12, flowSpeed: 0.4 },
];

// Seeded RNG (Mulberry32)
function createSeededRng(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return function() {
    hash |= 0;
    hash = (hash + 0x6d2b79f5) | 0;
    let t = Math.imul(hash ^ (hash >>> 15), 1 | hash);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Catmull-Rom spline interpolation
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

// Generate PERIODIC ribbon path (matching the new algorithm in emotions.ts)
function generateRibbonPath(
  emotion: Emotion,
  startY: number,
  seed: string
): [number, number][] {
  const rng = createSeededRng(seed);
  const [minPoints, maxPoints] = emotion.controlPoints;
  const numControlPoints = minPoints + Math.floor(rng() * (maxPoints - minPoints + 1));

  // Generate Y values for control points (circular array)
  const controlY: number[] = [];
  for (let i = 0; i < numControlPoints; i++) {
    const yOffset = (rng() - 0.5) * 2 * emotion.amplitude;
    controlY.push(startY + yOffset);
  }

  // Sample the PERIODIC spline at 64 points
  const path: [number, number][] = [];
  const outputPoints = 64;

  for (let i = 0; i < outputPoints; i++) {
    const t = i / outputPoints; // 0 to just before 1 (periodic)

    // Map t to control point space (periodic)
    const scaled = t * numControlPoints;
    const idx = Math.floor(scaled);
    const localT = scaled - idx;

    // Get 4 control points with PERIODIC wrapping
    const i0 = ((idx - 1) % numControlPoints + numControlPoints) % numControlPoints;
    const i1 = idx % numControlPoints;
    const i2 = (idx + 1) % numControlPoints;
    const i3 = (idx + 2) % numControlPoints;

    const y = catmullRom(controlY[i0], controlY[i1], controlY[i2], controlY[i3], localT);
    const clampedY = Math.max(0.08, Math.min(0.92, y));
    path.push([t, clampedY]);
  }

  return path;
}

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
