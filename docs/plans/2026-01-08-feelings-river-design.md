# ourfeelings.art — A River of Feelings

## Overview

A full-screen canvas where soft ribbons of color drift slowly like a gentle river. Each ribbon represents someone's feeling, contributed from somewhere in the world. The ribbons flow continuously, creating a living, breathing artwork of collective human emotion.

## Core Experience

### The Canvas
- Dark background with subtle radial gradient for depth
- Ribbons flow from right to left, looping seamlessly
- Pace is slow enough to feel peaceful, fast enough to always be changing

### Contributing a Feeling
1. **Open the emotion picker** — Tap "how do you feel?" at the bottom
2. **Choose an emotion** — Select from 6 options: joyful, calm, loving, hopeful, melancholic, anxious
3. **Watch it flow** — Your feeling becomes a ribbon with characteristics matching the emotion

### Returning Visitors
- Your feeling persists for 7 days
- After a 1-hour cooldown, you can update your emotion
- A cookie tracks your contribution locally

### Ambient Information (subtle, low opacity)
- Top left: "X feelings passing through" (live count of visible ribbons)
- Top right: Local time with period-of-day label (e.g., "9:51pm / quiet contemplation")

## Emotions & Their Ribbons

Each emotion has unique visual characteristics:

| Emotion | Color | Wave Style | Speed |
|---------|-------|------------|-------|
| Joyful | Golden yellow (#fbbf24) | Bouncy, energetic | Fast |
| Calm | Soft blue (#60a5fa) | Gentle, smooth | Slow |
| Loving | Soft pink (#f472b6) | Warm, flowing | Medium |
| Hopeful | Lavender (#a78bfa) | Uplifting | Medium |
| Melancholic | Deep indigo (#6366f1) | Slow, contemplative | Very slow |
| Anxious | Warm orange (#f97316) | Jittery, erratic | Very fast |

Ribbon paths are generated server-side using multi-octave Perlin noise for organic, non-repetitive motion. Paths are periodic to enable seamless looping.

## Vitality System

Ribbons age over their 7-day lifespan. As they age, their **vitality** decreases, affecting multiple visual properties:

```
vitality = 1 - (age / 7_days)^0.7
```

The 0.7 exponent creates gradual initial degradation — ribbons stay vibrant longer before fading.

### Properties Affected by Vitality

| Property | New (vitality=1) | Old (vitality=0) |
|----------|------------------|------------------|
| Opacity/Alpha | 100% | 0% (fades out) |
| Ribbon Length | 100% of base | 40% of base |
| Thickness | 100% of base | 40% of base |
| Glow Strength | 100% of base | 30% of base |
| Flow Speed | 120% of base | 50% of base |
| Particle Spawn Rate | 20% chance | 5% chance |

### Fade-in Effect
New ribbons fade in over 3 seconds to avoid jarring appearance.

This creates a natural lifecycle: new feelings are bold, bright, and fast; as they age, they become subtle whispers before fading away entirely.

## Visual Rendering

### WebGL2 Ribbon Renderer (Primary)
- Hardware-accelerated rendering for smooth 60fps performance
- Multi-layer glow effect for each ribbon
- Catmull-Rom spline interpolation for smooth curves from sparse point data
- Ribbons are rendered with tapered strokes (thicker middle, thinner ends)

### p5.js Canvas Renderer (Fallback)
- Canvas-based fallback for devices without WebGL2 support
- Same visual features: glow effects, tapered strokes, particles
- Slightly lower performance but broader compatibility

### Performance Optimizations
- Server sends only 32 points per ribbon; client interpolates to full smoothness
- ETag-based caching to minimize API calls
- WebGL2 for GPU-accelerated rendering (with p5.js fallback)
- Efficient ribbon culling and batching

## Technical Architecture

### Data Model (Vercel KV)
```typescript
interface Feeling {
  id: string;
  emotionId: string;     // Which emotion was selected
  color: string;         // Hex color
  path: [number, number][]; // Normalized 0-1 coordinates (32 points)
  createdAt: number;     // Timestamp
  expiresAt: number;     // createdAt + 7 days
  updateHash?: string;   // Secret hash for updates (only returned to creator)
}
```

### API Endpoints
- `GET /api/feelings` — Returns all active feelings (with ETag caching)
- `POST /api/feelings` — Creates or updates a feeling

### Rate Limiting
- 1 feeling per IP per hour
- Returning visitors can update their existing feeling after cooldown

### Client Architecture
- Next.js 16 with App Router
- WebGL2-based ribbon rendering
- Framer Motion for UI animations
- Tailwind CSS 4 for styling

## File Structure
```
src/
  app/
    page.tsx              # Main canvas page
    layout.tsx            # App layout with metadata
    globals.css           # Global styles
    api/
      feelings/
        route.ts          # GET and POST endpoints
  components/
    WebGLRibbonRenderer.tsx  # Main WebGL rendering
    P5Canvas.tsx             # Alternative p5.js renderer
    EmotionPicker.tsx        # Emotion selection UI
    AmbientInfo.tsx          # Corner stats/time display
    Settings.tsx             # Settings panel
  lib/
    feelingsState.ts      # Dev state management & TTL config
    emotions.ts           # Emotion definitions & ribbon generation
    spline.ts             # Catmull-Rom interpolation
    colors.ts             # Color utilities
    useIsMobile.ts        # Mobile detection hook
  types.ts                # TypeScript interfaces
```
