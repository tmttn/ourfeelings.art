// Emotion definitions with colors and ribbon generation parameters
export interface Emotion {
  id: string;
  label: string;
  color: string;
  // Ribbon generation parameters (Bézier spline approach)
  controlPoints: [number, number]; // Min and max control points for spline
  amplitude: number; // Max vertical deviation from center
  flowSpeed: number; // Relative speed modifier
}

export const EMOTIONS: Emotion[] = [
  {
    id: "joy",
    label: "joyful",
    color: "#facc15", // Bright yellow
    controlPoints: [7, 8],
    amplitude: 0.25,
    flowSpeed: 1.2,
  },
  {
    id: "calm",
    label: "calm",
    color: "#2dd4bf", // Teal
    controlPoints: [3, 4],
    amplitude: 0.18,
    flowSpeed: 0.7,
  },
  {
    id: "love",
    label: "loving",
    color: "#f472b6", // Warm pink
    controlPoints: [5, 6],
    amplitude: 0.20,
    flowSpeed: 0.9,
  },
  {
    id: "hope",
    label: "hopeful",
    color: "#38bdf8", // Sky blue
    controlPoints: [5, 6],
    amplitude: 0.20,
    flowSpeed: 1.0,
  },
  {
    id: "melancholy",
    label: "melancholic",
    color: "#8b5cf6", // Deep violet
    controlPoints: [4, 5],
    amplitude: 0.18,
    flowSpeed: 0.5,
  },
  {
    id: "anxious",
    label: "anxious",
    color: "#fb923c", // Orange
    controlPoints: [10, 12],
    amplitude: 0.30,
    flowSpeed: 1.5,
  },
  {
    id: "angry",
    label: "angry",
    color: "#ef4444", // Red
    controlPoints: [12, 14],
    amplitude: 0.35,
    flowSpeed: 1.8,
  },
  {
    id: "worn",
    label: "worn",
    color: "#94a3b8", // Muted sage
    controlPoints: [3, 4],
    amplitude: 0.12,
    flowSpeed: 0.4,
  },
];

/**
 * Mulberry32 - Fast, seedable 32-bit PRNG
 * Creates deterministic random sequences from a string seed
 */
function createSeededRng(seed: string): () => number {
  // Hash the string seed to a 32-bit integer
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Mulberry32 PRNG
  return function() {
    hash |= 0;
    hash = (hash + 0x6d2b79f5) | 0;
    let t = Math.imul(hash ^ (hash >>> 15), 1 | hash);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Catmull-Rom spline interpolation
 * Given 4 control points and t in [0,1], returns the interpolated point
 * This creates smooth curves that pass through the middle two points
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;

  // Catmull-Rom basis matrix (tension = 0.5)
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * Generate a smooth PERIODIC wave path for a ribbon based on emotion
 * Uses Catmull-Rom splines with random control points in a closed loop
 * The path seamlessly wraps for smooth snake animation
 */
export function generateRibbonPath(
  emotion: Emotion,
  startY: number = 0.5,
  seed: string = Math.random().toString()
): [number, number][] {
  const rng = createSeededRng(seed);

  // Determine number of control points based on emotion
  const [minPoints, maxPoints] = emotion.controlPoints;
  const numControlPoints = minPoints + Math.floor(rng() * (maxPoints - minPoints + 1));

  // Generate Y values for control points (treated as circular array)
  const controlY: number[] = [];
  for (let i = 0; i < numControlPoints; i++) {
    const yOffset = (rng() - 0.5) * 2 * emotion.amplitude;
    controlY.push(startY + yOffset);
  }

  // Sample the PERIODIC spline at 64 points
  const path: [number, number][] = [];
  const outputPoints = 64;

  for (let i = 0; i < outputPoints; i++) {
    // t goes from 0 to just before 1 (periodic, so t=1 would equal t=0)
    const t = i / outputPoints;

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

/**
 * Get a random Y position with good vertical spread
 * Uses uniform distribution for even coverage across the canvas
 */
export function getRandomStartY(): number {
  // Uniform distribution from 0.08 to 0.92 (nearly full height)
  return 0.08 + Math.random() * 0.84;
}
