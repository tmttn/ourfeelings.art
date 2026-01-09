# ourfeelings.art — A River of Feelings

## Overview

A full-screen canvas where soft ribbons of color drift slowly like a gentle river. Each ribbon represents someone's feeling, drawn from somewhere in the world. Small glowing particles emanate from the ribbons as they flow, creating a living, breathing artwork of collective human emotion.

## Core Experience

### The Canvas
- Dark background (`#0a0a12`) with subtle radial gradient for depth
- Ribbons flow from right to left over ~60 seconds, then fade out
- Pace is slow enough to feel peaceful, fast enough to always be changing

### Contributing a Feeling
1. **Hold** anywhere on screen — a soft glow appears, cycling through a color spectrum
2. **Release** when the color feels right — color locks in
3. **Draw** your feeling as a gesture
4. **Lift** to finish — your ribbon joins the river

### Ambient Information (subtle, 30% opacity)
- Bottom left: "42 feelings flowing" (live count of visible traces)
- Bottom right: "3:42am · night" (local time with period-of-day label)

### First Visit
- Hint fades in after 2 seconds: "hold anywhere to begin"
- Disappears after first interaction, never shows again (localStorage)

## Interaction Details

### Hold Phase
- Soft circular glow (30px) appears at touch/cursor position
- Color cycles through curated spectrum over ~3 seconds, loops
- Subtle pulse animation indicates active state
- Release locks the color with brief intensify effect

### Draw Phase
- Smooth ribbon follows gesture in selected color
- Glowing particles spawn along ribbon as it's drawn
- Maximum draw time: 5 seconds (graceful fade if exceeded)
- Minimum gesture length: 50px (prevents accidental taps)

### Release
- Ribbon joins the river flow with shimmer effect
- Data sent to server

## Visual Rendering

### Ribbons — Catmull-Rom Splines
- Raw points captured every ~16ms
- Interpolated with Catmull-Rom for smooth curves (4x point density)
- Tapered stroke: thicker middle, thinner ends
- Width varies with velocity (faster = thinner)

### Glow — Multi-layer
1. Base layer: full opacity ribbon
2. Inner glow: 150% wider, 30% opacity, lighter shade
3. Outer glow: 300% wider, 10% opacity, blurred

### Particles
- Spawn rate: ~3/second per ribbon
- Size: 2-5px circles with additive blend
- Behavior: river flow + slight upward drift + random wobble
- Lifespan: 2-4 seconds with linear opacity fade

### Color Spectrum
Curated emotional palette (slightly desaturated, gentle):
```
Soft pink → Warm coral → Golden amber →
Soft green → Teal → Sky blue →
Lavender → Soft purple → (loop)
```

### Typography
- Font: System sans-serif, 11-12px, weight 300
- Color: `rgba(255, 255, 255, 0.3)`
- Tabular numbers for count

## Technical Architecture

### Data Model (Vercel KV)
```typescript
interface Feeling {
  id: string;
  color: string;           // hex color
  path: [number, number][]; // normalized 0-1 coordinates
  createdAt: number;        // timestamp
  expiresAt: number;        // createdAt + 2 hours
}
```

### API Endpoints
- `GET /api/feelings` — Returns all active (non-expired) feelings
- `POST /api/feelings` — Creates new feeling (rate limited)

### Rate Limiting
- 1 feeling per IP per 30 seconds
- Maximum 100 path points per feeling

### Client Architecture
- Canvas-based rendering (HTML5 Canvas)
- Feelings fetched on load, polled every 10 seconds
- Flow animation runs client-side (x-position decreases over time)
- OffscreenCanvas for ribbon rendering (draw once, translate for flow)
- Particle system pattern for efficient particle rendering

### Performance Targets
- 60fps with up to 200 ribbons and 1000 particles
- Feelings persist for 2 hours in database

## File Structure
```
src/
  app/
    page.tsx           # Main canvas page
    api/
      feelings/
        route.ts       # GET and POST endpoints
  components/
    Canvas.tsx         # Main rendering component
    Hint.tsx           # First-visit hint
    AmbientInfo.tsx    # Corner stats/time display
  lib/
    feelingsState.ts   # Shared state management
    spline.ts          # Catmull-Rom interpolation
    particles.ts       # Particle system
    colors.ts          # Color spectrum utilities
  types.ts             # TypeScript interfaces
```
