/**
 * Curated color spectrum for emotional expression
 * Flows through: pink → coral → amber → green → teal → blue → lavender → purple
 */
const SPECTRUM_COLORS = [
  { h: 340, s: 60, l: 70 }, // Soft pink
  { h: 15, s: 70, l: 65 },  // Warm coral
  { h: 40, s: 75, l: 60 },  // Golden amber
  { h: 90, s: 45, l: 55 },  // Soft green
  { h: 175, s: 50, l: 50 }, // Teal
  { h: 200, s: 60, l: 65 }, // Sky blue
  { h: 260, s: 45, l: 70 }, // Lavender
  { h: 280, s: 50, l: 60 }, // Soft purple
];

/**
 * Get a color from the spectrum based on position (0-1)
 * Returns HSL color string
 */
export function getSpectrumColor(position: number): string {
  // Wrap position to 0-1 range
  const p = ((position % 1) + 1) % 1;

  // Find which two colors we're between
  const scaledPos = p * SPECTRUM_COLORS.length;
  const index = Math.floor(scaledPos);
  const t = scaledPos - index;

  const c1 = SPECTRUM_COLORS[index % SPECTRUM_COLORS.length];
  const c2 = SPECTRUM_COLORS[(index + 1) % SPECTRUM_COLORS.length];

  // Interpolate between colors
  // Handle hue wrapping (e.g., from 340 to 15)
  let h1 = c1.h;
  let h2 = c2.h;
  if (Math.abs(h2 - h1) > 180) {
    if (h1 > h2) h2 += 360;
    else h1 += 360;
  }

  const h = ((h1 + (h2 - h1) * t) % 360 + 360) % 360;
  const s = c1.s + (c2.s - c1.s) * t;
  const l = c1.l + (c2.l - c1.l) * t;

  return `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * Convert HSL string to hex color
 */
export function hslToHex(hsl: string): string {
  const match = hsl.match(/hsl\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%\)/);
  if (!match) return "#ffffff";

  const h = parseFloat(match[1]) / 360;
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hueToRgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }

  const toHexComponent = (value: number) => {
    const hex = Math.round(value * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHexComponent(r)}${toHexComponent(g)}${toHexComponent(b)}`;
}

/**
 * Parse hex color to RGB components
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace("#", "");
  if (cleanHex.length !== 6) return { r: 255, g: 255, b: 255 };

  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16),
  };
}

/**
 * Lighten a hex color by a given amount (0-1)
 */
export function lightenColor(hex: string, amount: number = 0.2): string {
  const { r, g, b } = hexToRgb(hex);

  const lighten = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));

  const toHexComponent = (c: number) => c.toString(16).padStart(2, "0");

  return `#${toHexComponent(lighten(r))}${toHexComponent(lighten(g))}${toHexComponent(lighten(b))}`;
}
