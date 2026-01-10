// Emotion definitions with colors and ribbon generation parameters
export interface Emotion {
  id: string;
  label: string;
  color: string;
  // Ribbon generation parameters
  waveAmplitude: number; // How wavy the ribbon is
  waveFrequency: number; // How many waves
  flowSpeed: number; // Relative speed modifier
}

export const EMOTIONS: Emotion[] = [
  {
    id: "joy",
    label: "joyful",
    color: "#facc15", // Bright yellow
    waveAmplitude: 0.07,
    waveFrequency: 2.5,
    flowSpeed: 1.2,
  },
  {
    id: "calm",
    label: "calm",
    color: "#2dd4bf", // Teal
    waveAmplitude: 0.05,
    waveFrequency: 1.8,
    flowSpeed: 0.7,
  },
  {
    id: "love",
    label: "loving",
    color: "#f472b6", // Warm pink
    waveAmplitude: 0.06,
    waveFrequency: 2.2,
    flowSpeed: 0.9,
  },
  {
    id: "hope",
    label: "hopeful",
    color: "#38bdf8", // Sky blue
    waveAmplitude: 0.055,
    waveFrequency: 2.0,
    flowSpeed: 1.0,
  },
  {
    id: "melancholy",
    label: "melancholic",
    color: "#8b5cf6", // Deep violet
    waveAmplitude: 0.045,
    waveFrequency: 1.6,
    flowSpeed: 0.5,
  },
  {
    id: "anxious",
    label: "anxious",
    color: "#fb923c", // Orange
    waveAmplitude: 0.08,
    waveFrequency: 2.8,
    flowSpeed: 1.5,
  },
  {
    id: "angry",
    label: "angry",
    color: "#ef4444", // Red
    waveAmplitude: 0.09,
    waveFrequency: 3.2,
    flowSpeed: 1.8,
  },
  {
    id: "worn",
    label: "worn",
    color: "#94a3b8", // Muted sage
    waveAmplitude: 0.035,
    waveFrequency: 1.3,
    flowSpeed: 0.4,
  },
];

// Simple 1D Perlin noise implementation for ribbon generation
// This runs on the server so we can't use p5's noise
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function grad(hash: number, x: number): number {
  return (hash & 1) === 0 ? x : -x;
}

// Permutation table
const p: number[] = [];
for (let i = 0; i < 256; i++) p[i] = i;
// Shuffle with fixed seed for reproducibility
for (let i = 255; i > 0; i--) {
  const j = Math.floor((i + 1) * 0.618033988749895 * (i + 1)) % (i + 1);
  [p[i], p[j]] = [p[j], p[i]];
}
const perm = [...p, ...p]; // Double it for overflow

function noise1D(x: number, seed: number): number {
  // Offset by seed to get different sequences
  x = x + seed * 1000;
  const xi = Math.floor(x) & 255;
  const xf = x - Math.floor(x);
  const u = fade(xf);
  return lerp(grad(perm[xi], xf), grad(perm[xi + 1], xf - 1), u);
}

/**
 * Generate a smooth organic wave path for a ribbon based on emotion
 * Uses multiple octaves of Perlin noise for natural, non-wave-like motion
 * The path is PERIODIC - start and end Y values match for seamless looping
 */
export function generateRibbonPath(
  emotion: Emotion,
  startY: number = 0.5,
  seed: number = Math.random()
): [number, number][] {
  const path: [number, number][] = [];
  // Reduced from 100 to 32 points - Catmull-Rom interpolation on client smooths this out
  // This cuts payload size by ~70% while maintaining visual quality
  const points = 32;

  // Base amplitude from emotion (how much vertical movement)
  const baseAmplitude = Math.max(0.12, emotion.waveAmplitude * 2.5);

  // Number of complete cycles for periodicity
  const cycles = Math.round(Math.max(3, emotion.waveFrequency + seed * 2));

  // Pre-sample noise at multiple octaves for organic movement
  // Each octave has different frequency and is made periodic
  const octaves = 5;
  const noiseOctaves: number[][] = [];

  for (let oct = 0; oct < octaves; oct++) {
    const octaveFreq = cycles * Math.pow(2, oct); // 1x, 2x, 4x, 8x, 16x frequency
    const values: number[] = [];
    for (let i = 0; i <= octaveFreq; i++) {
      values.push(noise1D(i * 0.7, seed + oct * 100));
    }
    // Make periodic
    values[octaveFreq] = values[0];
    noiseOctaves.push(values);
  }

  // Helper to sample periodic noise with smoothstep interpolation
  const samplePeriodicNoise = (
    t: number,
    values: number[],
    freq: number
  ): number => {
    const scaled = t * freq;
    const idx = Math.floor(scaled);
    const frac = scaled - idx;
    const smooth = frac * frac * (3 - 2 * frac); // smoothstep
    return values[idx] + (values[idx + 1] - values[idx]) * smooth;
  };

  // Generate points
  for (let i = 0; i < points; i++) {
    const t = i / points;
    const x = t;

    // Sum multiple octaves of noise (fractal Brownian motion style)
    let noiseSum = 0;
    let amplitudeSum = 0;
    let currentAmp = 1;
    const persistence = 0.5; // How much each octave contributes

    for (let oct = 0; oct < octaves; oct++) {
      const octaveFreq = cycles * Math.pow(2, oct);
      const noiseVal = samplePeriodicNoise(t, noiseOctaves[oct], octaveFreq);
      noiseSum += noiseVal * currentAmp;
      amplitudeSum += currentAmp;
      currentAmp *= persistence;
    }

    // Normalize
    const normalizedNoise = noiseSum / amplitudeSum;

    // Add a very subtle underlying wave for gentle flow direction
    const subtleWave =
      Math.sin(t * Math.PI * 2 * cycles + seed * Math.PI * 2) * 0.15;

    // Combine: mostly noise, slight wave influence
    const y =
      startY + (normalizedNoise * 0.85 + subtleWave * 0.15) * baseAmplitude;

    path.push([x, Math.max(0.08, Math.min(0.92, y))]);
  }

  return path;
}

/**
 * Get a random Y position weighted toward center
 */
export function getRandomStartY(): number {
  // Gaussian-ish distribution centered at 0.5
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return 0.5 + gaussian * 0.15; // Centered at 0.5, most within 0.2-0.8
}
