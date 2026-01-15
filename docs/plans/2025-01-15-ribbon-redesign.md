# Ribbon Redesign: Periodic Catmull-Rom Splines

## Problem
Current ribbon paths use fractal Brownian motion (Perlin noise) which creates kinks — local curvature discontinuities that look jarring.

## Solution
Replace Perlin noise with **periodic Catmull-Rom splines** using randomly-placed control points in a closed loop. This guarantees smooth curves that seamlessly wrap for snake animation.

## Design

### Path Generation Algorithm

1. **Seed RNG** using feeling's `id` for deterministic generation
2. **Generate N control points** where N is emotion-dependent:
   - X positions: evenly spaced with slight jitter
   - Y positions: random within amplitude bounds, centered at `startY`
3. **Convert to Catmull-Rom spline** that passes through all control points
4. **Sample 32 points** along the spline for storage

### Emotion Parameters

| Emotion    | Control Points | Amplitude | Character            |
|------------|---------------|-----------|----------------------|
| Calm       | 3-4           | ±0.18     | Long, gentle swells  |
| Worn       | 3-4           | ±0.12     | Subtle movement      |
| Hope       | 5-6           | ±0.20     | Balanced, optimistic |
| Love       | 5-6           | ±0.20     | Soft, flowing        |
| Melancholy | 4-5           | ±0.18     | Slow, drooping       |
| Joy        | 7-8           | ±0.25     | Lively, bouncy       |
| Anxious    | 10-12         | ±0.30     | Busy, erratic        |
| Angry      | 12-14         | ±0.35     | Chaotic, aggressive  |

### Vitality Integration (Rendering Time)

As vitality decreases (1.0 → 0.0 over 7 days):
- **Amplitude scaling**: Rendered amplitude reduces to ~85% of original (keeps ribbons spread)
- **Animation speed**: Snake undulation slows to ~30% of original
- Existing effects preserved: alpha fade, thickness reduction, length shortening

### Animation: Living Wave

Use **phase shift sampling** along the spline:
- The stored path shape is fixed
- At render time, sample positions are offset based on time
- Creates traveling wave / snake-like undulation
- No control point animation needed — simpler and more performant

### Determinism

- Feeling `id` seeds the RNG
- Same id + emotion = identical path on every device, every time
- Enables regeneration for disaster recovery

### Migration

One-time batch migration script:
1. Fetch all feelings from database
2. For each feeling: regenerate path using new algorithm
3. Update path in database
4. New feelings use new algorithm at creation time

## Files to Modify

1. `src/lib/emotions.ts` — Replace `generateRibbonPath()` with Bézier spline algorithm
2. `src/components/WebGLRibbonRenderer.tsx` — Adjust vitality-based amplitude/speed scaling
3. `scripts/migrate-ribbon-paths.ts` (new) — One-time migration script

## Implementation Notes

- Path format unchanged: `[number, number][]` with 32 points
- WebGL renderer structure unchanged — just receives better paths
- Catmull-Rom ensures curve passes through control points (not just near them)
- Seeded RNG: use mulberry32 or similar fast, seedable PRNG
