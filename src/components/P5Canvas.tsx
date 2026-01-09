"use client";

import { useRef, useEffect, useState } from "react";
import type { Feeling, Point } from "@/types";
import type p5Type from "p5";
import type { PerformanceSettings } from "./Settings";

interface P5CanvasProps {
  feelings: Feeling[];
  settings?: PerformanceSettings;
  isMobile?: boolean;
  reducedMotion?: boolean;
}

// Default settings if none provided - conservative for good performance
const DEFAULT_PERF_SETTINGS: PerformanceSettings = {
  maxVisibleRibbons: 35,
  catmullRomSegments: 3,
  enableGlow: false,
  targetParticles: 15,
  renderer: "canvas", // P5Canvas is always 2D canvas mode
};

// Flow animation constants
// Ribbon flows continuously from right to left, looping seamlessly
const FLOW_SPEED = 0.00002; // Speed of horizontal flow
const WAVE_AMPLITUDE = 0.006; // Gentle vertical undulation
const WAVE_FREQUENCY = 0.0002; // How fast the undulation cycles

// Particle system
interface Particle {
  x: number;
  y: number;
  size: number;
  color: p5Type.Color;
  life: number;
  maxLife: number;
  noiseOffsetX: number;
  noiseOffsetY: number;
}

// Mobile frame rate target (saves battery, reduces heat)
const MOBILE_FRAME_RATE = 30;
const DESKTOP_FRAME_RATE = 60;

// Reduced motion frame rate (even lower for accessibility)
const REDUCED_MOTION_FRAME_RATE = 20;

// FPS monitoring for auto-scaling
const FPS_SAMPLE_SIZE = 30; // Rolling average over 30 frames
const FPS_LOW_THRESHOLD = 25; // Below this = reduce quality
const FPS_RECOVERY_THRESHOLD = 45; // Above this = can increase quality

// Color conversion cache to avoid repeated hex parsing
const colorCache = new Map<string, { r: number; g: number; b: number }>();

function getCachedRgb(hex: string): { r: number; g: number; b: number } {
  let cached = colorCache.get(hex);
  if (!cached) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    cached = result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 255, g: 255, b: 255 };
    colorCache.set(hex, cached);
  }
  return cached;
}

export default function P5Canvas({ feelings, settings, isMobile = false, reducedMotion = false }: P5CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5Type | null>(null);
  const feelingsRef = useRef<Feeling[]>(feelings);
  const settingsRef = useRef<PerformanceSettings>(settings || DEFAULT_PERF_SETTINGS);
  const isMobileRef = useRef(isMobile);
  const reducedMotionRef = useRef(reducedMotion);
  const [p5Module, setP5Module] = useState<typeof p5Type | null>(null);

  // Dynamically import p5 on client side only
  useEffect(() => {
    import("p5").then((mod) => {
      setP5Module(() => mod.default);
    });
  }, []);

  // Keep feelings ref updated
  useEffect(() => {
    feelingsRef.current = feelings;
  }, [feelings]);

  // Keep settings ref updated
  useEffect(() => {
    settingsRef.current = settings || DEFAULT_PERF_SETTINGS;
  }, [settings]);

  // Keep isMobile ref updated
  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  // Keep reducedMotion ref updated
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    if (!containerRef.current || !p5Module) return;

    // Clean up existing instance
    if (p5InstanceRef.current) {
      p5InstanceRef.current.remove();
    }

    const sketch = (p: p5Type) => {
      const particles: Particle[] = [];

      // FPS monitoring for auto-scaling
      const fpsSamples: number[] = [];
      let currentMaxRibbons = settingsRef.current.maxVisibleRibbons;
      let lastFpsCheck = 0;
      const FPS_CHECK_INTERVAL = 1000; // Check FPS every second

      // Ambient particle colors
      const ambientColors = [
        "#4a5568",
        "#553c9a",
        "#2b6cb0",
        "#285e61",
        "#5a4a78",
        "#3d5a80",
        "#4a4e69",
      ];

      p.setup = () => {
        // Use 2D canvas with GPU-optimized settings
        const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
        canvas.style("display", "block");
        p.colorMode(p.RGB, 255, 255, 255, 1);
        p.noiseDetail(isMobileRef.current ? 2 : 4, 0.5); // Reduced noise detail on mobile
        p.noiseSeed(42);

        // Get 2D context and enable GPU acceleration hints
        const ctx = (p as unknown as { drawingContext: CanvasRenderingContext2D }).drawingContext;
        // Hint to browser for GPU acceleration
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Limit frame rate based on device/preferences
        const targetFrameRate = reducedMotionRef.current
          ? REDUCED_MOTION_FRAME_RATE
          : isMobileRef.current
            ? MOBILE_FRAME_RATE
            : DESKTOP_FRAME_RATE;
        p.frameRate(targetFrameRate);

        // Initialize particles
        for (let i = 0; i < settingsRef.current.targetParticles; i++) {
          spawnParticle();
        }
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
      };

      const spawnParticle = () => {
        const colorHex =
          ambientColors[Math.floor(Math.random() * ambientColors.length)];
        const col = p.color(colorHex);
        particles.push({
          x: p.random(p.width),
          y: p.random(p.height),
          size: p.random(1, 3),
          color: col,
          life: p.random(120000, 300000),
          maxLife: 0,
          noiseOffsetX: p.random(1000),
          noiseOffsetY: p.random(1000),
        });
        particles[particles.length - 1].maxLife =
          particles[particles.length - 1].life;
      };

      // Lightened color cache
      const lightenedCache = new Map<string, { r: number; g: number; b: number }>();

      const lightenColor = (hex: string, amount: number) => {
        const cacheKey = `${hex}_${amount}`;
        let cached = lightenedCache.get(cacheKey);
        if (!cached) {
          const { r, g, b } = getCachedRgb(hex);
          cached = {
            r: Math.min(255, r + (255 - r) * amount),
            g: Math.min(255, g + (255 - g) * amount),
            b: Math.min(255, b + (255 - b) * amount),
          };
          lightenedCache.set(cacheKey, cached);
        }
        return cached;
      };

      // Catmull-Rom spline with periodic (looping) support
      const catmullRomSpline = (
        points: Point[],
        segments: number,
        periodic: boolean = false
      ): Point[] => {
        if (points.length < 2) return points;
        const result: Point[] = [];
        const n = points.length;

        // For periodic paths, we loop around; for non-periodic, we clamp
        const getPoint = (i: number): Point => {
          if (periodic) {
            // Wrap around for periodic paths
            return points[((i % n) + n) % n];
          } else {
            // Clamp for non-periodic paths
            return points[Math.max(0, Math.min(n - 1, i))];
          }
        };

        const loopEnd = periodic ? n : n - 1;

        for (let i = 0; i < loopEnd; i++) {
          const p0 = getPoint(i - 1);
          const p1 = getPoint(i);
          const p2 = getPoint(i + 1);
          const p3 = getPoint(i + 2);

          for (let t = 0; t < segments; t++) {
            const s = t / segments;
            const s2 = s * s;
            const s3 = s2 * s;

            const x =
              0.5 *
              (2 * p1.x +
                (-p0.x + p2.x) * s +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3);

            const y =
              0.5 *
              (2 * p1.y +
                (-p0.y + p2.y) * s +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3);

            result.push({ x, y });
          }
        }

        if (!periodic) {
          result.push(points[points.length - 1]);
        }

        return result;
      };

      // Ribbon particles that float off from ribbons
      interface RibbonParticle {
        x: number;
        y: number;
        vx: number;
        vy: number;
        size: number;
        color: string;
        life: number;
        maxLife: number;
        fadeScale: number; // Opacity multiplier based on spawn position
      }
      const ribbonParticles: RibbonParticle[] = [];
      // Cap ribbon particles based on feeling count to prevent overload
      const getMaxRibbonParticles = () => {
        const count = feelingsRef.current.length;
        if (count > 200) return 15;
        if (count > 100) return 25;
        if (count > 50) return 35;
        return 50;
      };

      const spawnRibbonParticle = (
        x: number,
        y: number,
        color: string,
        thickness: number,
        progress: number // 0 = tail (small/faded), 1 = head (full size/opacity)
      ) => {
        if (ribbonParticles.length >= getMaxRibbonParticles()) return;
        // Only small particles - no large ones
        const sizeRand = Math.random();
        const baseSize =
          sizeRand < 0.7
            ? 1 + Math.random() * 2 // 70% tiny (1-3px)
            : 2 + Math.random() * 3; // 30% small (2-5px)

        // Scale size based on position along ribbon (smaller at tail)
        const sizeScale = 0.3 + 0.7 * progress; // 30% to 100%

        ribbonParticles.push({
          x,
          y,
          vx: Math.random() * 0.3, // Only positive = drift right (backward relative to ribbon flow)
          vy: (Math.random() - 0.5) * 0.4, // Drift up or down
          size: (baseSize + thickness * 0.05) * sizeScale,
          color,
          life: 1000 + Math.random() * 1500, // Shorter lifetime for faster fade-out
          maxLife: 0,
          fadeScale: 0.3 + 0.7 * progress, // Store fade scale for rendering (30% to 100%)
        });
        ribbonParticles[ribbonParticles.length - 1].maxLife =
          ribbonParticles[ribbonParticles.length - 1].life;
      };

      // Simple hash function to get consistent random values per feeling
      const hashString = (str: string): number => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash;
        }
        return Math.abs(hash);
      };

      // Get a seeded random value between min and max
      const seededRandom = (seed: number, min: number, max: number): number => {
        const x = Math.sin(seed) * 10000;
        const rand = x - Math.floor(x);
        return min + rand * (max - min);
      };

      // Reusable offscreen canvas - use fixed size to avoid constant reallocation
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = 2048;
      offscreenCanvas.height = 512;
      // Hint to browser that we won't read pixels back - enables GPU optimization
      const offscreenCtx = offscreenCanvas.getContext("2d", {
        willReadFrequently: false,
        alpha: true,
      })!;

      // Cached background gradient (only recreate on resize)
      let cachedBgGradient: CanvasGradient | null = null;
      let cachedBgWidth = 0;
      let cachedBgHeight = 0;

      const drawRibbon = (
        path: Point[],
        color: string,
        alpha: number,
        thickness: number,
        glowStrength: number,
        particleSpawnRate: number,
        periodic: boolean = false
      ) => {
        if (path.length < 2) return;

        // Interpolation for smoother curves
        const smoothPath = catmullRomSpline(path, settingsRef.current.catmullRomSegments, periodic);
        if (smoothPath.length < 2) return;

        const { r, g, b } = getCachedRgb(color);
        const lighter = lightenColor(color, 0.3);

        const dc = p.drawingContext as CanvasRenderingContext2D;

        // Get bounding box of ribbon for efficient offscreen rendering
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const pt of smoothPath) {
          const px = pt.x * p.width;
          const py = pt.y * p.height;
          minX = Math.min(minX, px);
          maxX = Math.max(maxX, px);
          minY = Math.min(minY, py);
          maxY = Math.max(maxY, py);
        }

        // Add padding for glow
        const padding = thickness * 2;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(p.width, maxX + padding);
        maxY = Math.min(p.height, maxY + padding);

        const boxWidth = Math.ceil(maxX - minX);
        const boxHeight = Math.ceil(maxY - minY);

        if (boxWidth <= 0 || boxHeight <= 0) return;

        // Skip if too large for offscreen canvas
        if (boxWidth > 2048 || boxHeight > 512) return;

        // Clear the region we'll use
        offscreenCtx.clearRect(0, 0, boxWidth, boxHeight);
        offscreenCtx.lineCap = "round";
        offscreenCtx.lineJoin = "round";

        // Pre-calculate ribbon spine data (shared between width variations)
        // This avoids recalculating perpendiculars for each layer
        const spineData: { px: number; py: number; perpX: number; perpY: number; widthRatio: number; headAngle?: number }[] = [];
        const pathLen = smoothPath.length - 1;

        for (let i = 0; i < smoothPath.length; i++) {
          const pt = smoothPath[i];
          const px = pt.x * p.width - minX;
          const py = pt.y * p.height - minY;

          // Progress: 0 = tail (thin), 1 = head (thick)
          const progress = i / pathLen;
          // Width varies smoothly from 20% at tail to 100% at head
          const widthRatio = 0.2 + 0.8 * Math.pow(progress, 0.6);

          // Get perpendicular direction
          let dx = 0, dy = 1;
          if (i < smoothPath.length - 1) {
            const next = smoothPath[i + 1];
            dx = next.x * p.width - pt.x * p.width;
            dy = next.y * p.height - pt.y * p.height;
          } else if (i > 0) {
            const prev = smoothPath[i - 1];
            dx = pt.x * p.width - prev.x * p.width;
            dy = pt.y * p.height - prev.y * p.height;
          }
          const len = Math.sqrt(dx * dx + dy * dy) || 1;

          spineData.push({
            px,
            py,
            perpX: -dy / len,
            perpY: dx / len,
            widthRatio,
            headAngle: i === smoothPath.length - 1 ? Math.atan2(dy, dx) : undefined
          });
        }

        // Build ribbon shape using pre-calculated spine (fast)
        const buildRibbonShape = (ctx: CanvasRenderingContext2D, widthMultiplier: number) => {
          const halfThickness = thickness * widthMultiplier * 0.5;

          // Build edges from spine data
          ctx.beginPath();

          // Top edge (forward)
          let spine = spineData[0];
          let halfWidth = halfThickness * spine.widthRatio;
          ctx.moveTo(spine.px + spine.perpX * halfWidth, spine.py + spine.perpY * halfWidth);

          for (let i = 1; i < spineData.length; i++) {
            spine = spineData[i];
            halfWidth = halfThickness * spine.widthRatio;
            ctx.lineTo(spine.px + spine.perpX * halfWidth, spine.py + spine.perpY * halfWidth);
          }

          // Rounded cap at head
          const headSpine = spineData[spineData.length - 1];
          const headHalfWidth = halfThickness * headSpine.widthRatio;
          const cpDist = headHalfWidth * 1.1;
          const dirX = Math.cos(headSpine.headAngle!);
          const dirY = Math.sin(headSpine.headAngle!);

          const topEndX = headSpine.px + headSpine.perpX * headHalfWidth;
          const topEndY = headSpine.py + headSpine.perpY * headHalfWidth;
          const bottomEndX = headSpine.px - headSpine.perpX * headHalfWidth;
          const bottomEndY = headSpine.py - headSpine.perpY * headHalfWidth;

          ctx.bezierCurveTo(
            topEndX + dirX * cpDist, topEndY + dirY * cpDist,
            bottomEndX + dirX * cpDist, bottomEndY + dirY * cpDist,
            bottomEndX, bottomEndY
          );

          // Bottom edge (backward)
          for (let i = spineData.length - 2; i >= 0; i--) {
            spine = spineData[i];
            halfWidth = halfThickness * spine.widthRatio;
            ctx.lineTo(spine.px - spine.perpX * halfWidth, spine.py - spine.perpY * halfWidth);
          }
          ctx.closePath();
        };

        // Glow layer (optional - expensive)
        if (settingsRef.current.enableGlow) {
          offscreenCtx.save();
          offscreenCtx.filter = `blur(${Math.min(thickness * 0.4 * glowStrength, 12)}px)`;
          offscreenCtx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
          buildRibbonShape(offscreenCtx, 0.5);
          offscreenCtx.fill();
          offscreenCtx.filter = "none";
          offscreenCtx.restore();
        } else {
          // Soft outer edge (cheaper than blur)
          offscreenCtx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
          buildRibbonShape(offscreenCtx, 0.35);
          offscreenCtx.fill();
        }

        // Core
        offscreenCtx.fillStyle = `rgba(${lighter.r}, ${lighter.g}, ${lighter.b}, 1)`;
        buildRibbonShape(offscreenCtx, 0.15);
        offscreenCtx.fill();

        // Apply gradient fade using destination-in composite
        // Fade from transparent (tail/start) to opaque (head/end)
        const startPt = smoothPath[0];
        const endPt = smoothPath[smoothPath.length - 1];
        const gradX1 = startPt.x * p.width - minX;
        const gradY1 = startPt.y * p.height - minY;
        const gradX2 = endPt.x * p.width - minX;
        const gradY2 = endPt.y * p.height - minY;

        const fadeGradient = offscreenCtx.createLinearGradient(gradX1, gradY1, gradX2, gradY2);
        fadeGradient.addColorStop(0, "rgba(255,255,255,0)");
        fadeGradient.addColorStop(0.3, "rgba(255,255,255,0.5)");
        fadeGradient.addColorStop(1, "rgba(255,255,255,1)");

        offscreenCtx.globalCompositeOperation = "destination-in";
        offscreenCtx.fillStyle = fadeGradient;
        offscreenCtx.fillRect(0, 0, boxWidth, boxHeight);
        offscreenCtx.globalCompositeOperation = "source-over";

        // Draw offscreen canvas to main canvas with alpha
        // Avoid save/restore - just set and reset globalAlpha (faster GPU state change)
        dc.globalAlpha = alpha;
        dc.drawImage(offscreenCanvas, 0, 0, boxWidth, boxHeight, minX, minY, boxWidth, boxHeight);
        dc.globalAlpha = 1;

        // Spawn ribbon particles along the path (rate based on vitality)
        if (Math.random() < particleSpawnRate) {
          const biasedRand = Math.pow(Math.random(), 0.5);
          const idx = Math.floor(biasedRand * smoothPath.length);
          const pt = smoothPath[idx];
          if (pt.x >= 0 && pt.x <= 1) {
            // Progress: 0 = tail, 1 = head (matches ribbon width/opacity gradient)
            const spawnProgress = idx / (smoothPath.length - 1);
            spawnRibbonParticle(pt.x * p.width, pt.y * p.height, color, thickness, spawnProgress);
          }
        }
      };

      p.draw = () => {
        const now = Date.now();

        // FPS monitoring and auto-scaling
        const currentFps = p.frameRate();
        fpsSamples.push(currentFps);
        if (fpsSamples.length > FPS_SAMPLE_SIZE) {
          fpsSamples.shift();
        }

        // Check FPS periodically and adjust ribbon count
        if (now - lastFpsCheck > FPS_CHECK_INTERVAL && fpsSamples.length >= FPS_SAMPLE_SIZE) {
          lastFpsCheck = now;
          const avgFps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;

          // User's base setting (what they chose in settings)
          const userMaxRibbons = settingsRef.current.maxVisibleRibbons;

          if (avgFps < FPS_LOW_THRESHOLD && currentMaxRibbons > 10) {
            // Performance is bad - reduce ribbon count
            currentMaxRibbons = Math.max(10, Math.floor(currentMaxRibbons * 0.7));
          } else if (avgFps > FPS_RECOVERY_THRESHOLD && currentMaxRibbons < userMaxRibbons) {
            // Performance is good - slowly recover toward user's setting
            currentMaxRibbons = Math.min(userMaxRibbons, currentMaxRibbons + 5);
          }
        }

        // Use the dynamically adjusted ribbon count
        const effectiveMaxRibbons = Math.min(currentMaxRibbons, settingsRef.current.maxVisibleRibbons);

        const ctx = (
          p as unknown as { drawingContext: CanvasRenderingContext2D }
        ).drawingContext;

        // Cache background gradient (only recreate on resize)
        if (!cachedBgGradient || cachedBgWidth !== p.width || cachedBgHeight !== p.height) {
          const centerX = p.width * 0.5;
          const centerY = p.height * 0.6;
          const maxRadius = Math.max(p.width, p.height);

          cachedBgGradient = ctx.createRadialGradient(
            centerX,
            centerY,
            0,
            centerX,
            centerY,
            maxRadius
          );
          // Deep blue/purple at center, darker at edges
          cachedBgGradient.addColorStop(0, "#1a1525");
          cachedBgGradient.addColorStop(0.4, "#121018");
          cachedBgGradient.addColorStop(0.7, "#0d0d14");
          cachedBgGradient.addColorStop(1, "#080810");

          cachedBgWidth = p.width;
          cachedBgHeight = p.height;
        }

        ctx.fillStyle = cachedBgGradient;
        ctx.fillRect(0, 0, p.width, p.height);

        // Aurora - smooth vertical gradient (reduced color stops for performance)
        const auroraTime = now * 0.0001;
        const auroraGradient = ctx.createLinearGradient(0, 0, 0, p.height);

        // Reduced from 11 to 5 color stops (still smooth, much faster)
        for (let i = 0; i <= 4; i++) {
          const t = i / 4;
          const red = Math.round(40 + Math.sin(auroraTime + t) * 20);
          const green = Math.round(60 + Math.sin(auroraTime + t + 1) * 20);
          const blue = Math.round(80 + Math.sin(auroraTime + t + 2) * 20);
          auroraGradient.addColorStop(t, `rgba(${red}, ${green}, ${blue}, 0.02)`);
        }

        ctx.fillStyle = auroraGradient;
        ctx.fillRect(0, 0, p.width, p.height);

        // Update and draw particles using native canvas for batching
        const noiseTime = now * 0.00005;
        const TWO_PI = Math.PI * 2;

        // First pass: update positions and remove dead particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const particle = particles[i];
          particle.life -= p.deltaTime;

          if (particle.life <= 0) {
            particles.splice(i, 1);
            continue;
          }

          // Perlin noise movement
          const noiseX = p.noise(
            particle.noiseOffsetX + particle.x * 0.001,
            particle.y * 0.001,
            noiseTime
          );
          const noiseY = p.noise(
            particle.noiseOffsetY + particle.x * 0.001,
            particle.y * 0.001,
            noiseTime + 100
          );

          const angle = noiseX * TWO_PI * 2;
          const speed = 0.08;

          particle.x += Math.cos(angle) * speed;
          particle.y += Math.sin(angle) * speed + (noiseY - 0.5) * 0.05;

          // Soft boundary
          const margin = 50;
          if (particle.x < margin) particle.x += (margin - particle.x) * 0.001;
          if (particle.x > p.width - margin)
            particle.x -= (particle.x - (p.width - margin)) * 0.001;
          if (particle.y < margin) particle.y += (margin - particle.y) * 0.001;
          if (particle.y > p.height - margin)
            particle.y -= (particle.y - (p.height - margin)) * 0.001;

          particle.x = p.constrain(particle.x, 0, p.width);
          particle.y = p.constrain(particle.y, 0, p.height);
        }

        // Second pass: batch render particles - GPU optimized
        // Group by color to minimize fillStyle changes (expensive GPU state change)
        if (particles.length > 0) {
          // Pre-calculate particle data once
          const particleData = particles.map(particle => {
            const lifeRatio = particle.life / particle.maxLife;
            let alpha = lifeRatio > 0.9 ? (1 - lifeRatio) / 0.1 : lifeRatio < 0.1 ? lifeRatio / 0.1 : 1;
            alpha *= 0.5;
            const col = particle.color;
            return {
              x: particle.x,
              y: particle.y,
              size: particle.size,
              alpha,
              r: p.red(col),
              g: p.green(col),
              b: p.blue(col)
            };
          });

          // Layer 1: Outer glow - batch all circles into single path per alpha bucket
          ctx.globalAlpha = 0.1;
          for (const pd of particleData) {
            ctx.fillStyle = `rgb(${pd.r}, ${pd.g}, ${pd.b})`;
            ctx.globalAlpha = pd.alpha * 0.1;
            ctx.beginPath();
            ctx.arc(pd.x, pd.y, pd.size * 3, 0, TWO_PI);
            ctx.fill();
          }

          // Layer 2: Mid glow
          for (const pd of particleData) {
            ctx.fillStyle = `rgb(${pd.r}, ${pd.g}, ${pd.b})`;
            ctx.globalAlpha = pd.alpha * 0.25;
            ctx.beginPath();
            ctx.arc(pd.x, pd.y, pd.size * 1.5, 0, TWO_PI);
            ctx.fill();
          }

          // Layer 3: Core
          for (const pd of particleData) {
            ctx.fillStyle = `rgb(${pd.r}, ${pd.g}, ${pd.b})`;
            ctx.globalAlpha = pd.alpha * 0.7;
            ctx.beginPath();
            ctx.arc(pd.x, pd.y, pd.size * 0.5, 0, TWO_PI);
            ctx.fill();
          }

          // Layer 4: White highlight - single color, most batchable
          ctx.fillStyle = "rgb(255, 255, 255)";
          for (const pd of particleData) {
            ctx.globalAlpha = pd.alpha * 0.4;
            ctx.beginPath();
            ctx.arc(pd.x, pd.y, pd.size * 0.2, 0, TWO_PI);
            ctx.fill();
          }

          // Reset globalAlpha
          ctx.globalAlpha = 1;
        }

        // Maintain particles
        while (particles.length < settingsRef.current.targetParticles) {
          spawnParticle();
        }

        // Draw ribbons - continuous flow from right to left
        // Sort by creation time to ensure consistent stagger order
        const sortedFeelings = [...feelingsRef.current].sort(
          (a, b) => a.createdAt - b.createdAt
        );

        // Track how many ribbons we've rendered this frame
        let renderedCount = 0;

        for (let fi = 0; fi < sortedFeelings.length; fi++) {
          // Limit total rendered ribbons for performance (use FPS-adjusted count)
          if (renderedCount >= effectiveMaxRibbons) break;

          const feeling = sortedFeelings[fi];
          // Stagger entry: each ribbon waits an additional 3 seconds before appearing
          const staggerDelay = fi * 3000;
          const age = now - feeling.createdAt - staggerDelay;
          if (age < 0) continue; // Not yet time to show this ribbon

          // Generate consistent variation based on feeling ID
          const hash = hashString(feeling.id);
          const baseRibbonLength = seededRandom(hash, 0.5, 1.2); // Base: 50% to 120% screen width
          const baseThickness = seededRandom(hash + 1, 18, 40); // Base stroke weight
          const baseGlowStrength = seededRandom(hash + 2, 0.6, 1.4); // Glow intensity
          const baseSpeedVariation = seededRandom(hash + 3, 0.85, 1.15); // Per-ribbon speed variation

          // Calculate age-based degradation (7 day lifespan)
          const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
          const ageRatio = Math.min(1, age / SEVEN_DAYS_MS); // 0 = new, 1 = 7 days old

          // Vitality decreases over time: 1.0 (new) -> 0.0 (7 days)
          // Use easing for more gradual initial degradation
          const vitality = 1 - Math.pow(ageRatio, 0.7);

          // Alpha: bright when new, fades over time
          // Quick fade-in at start, then gradual fade based on age
          let alpha: number;
          const fadeInDuration = 3000; // 3 seconds to fade in
          if (age < fadeInDuration) {
            alpha = (age / fadeInDuration) * vitality;
          } else {
            alpha = vitality;
          }

          // Skip if completely faded
          if (alpha < 0.01) continue;

          // Ribbon length scales with vitality: new = longer, old = shorter
          // Range: 40% of base (old) to 100% of base (new)
          const ribbonLength = baseRibbonLength * (0.4 + vitality * 0.6);

          // Thickness and glow also degrade with age
          const thickness = baseThickness * (0.4 + vitality * 0.6); // 40%-100% of base
          const glowStrength = baseGlowStrength * (0.3 + vitality * 0.7); // 30%-100% of base

          // Particle spawn rate based on vitality (young = more particles)
          const particleSpawnRate = 0.05 + vitality * 0.15; // 5%-20% spawn chance

          // Speed scales with vitality: new = faster, old = slower
          // Range: 50% of base (old) to 120% of base (new)
          const speedVariation = baseSpeedVariation * (0.5 + vitality * 0.7);

          // How far the HEAD of the ribbon has traveled (in screen widths)
          const headTravel = age * FLOW_SPEED * speedVariation;

          // Cycle length for wrapping (screen width + ribbon length)
          const cycleLength = 1.0 + ribbonLength;
          const headX = 1.0 - (headTravel % cycleLength);

          // Early frustum culling - skip before building path if entirely off-screen
          const tailX = headX + ribbonLength;
          if (headX > 1.2 || tailX < -0.2) continue;

          // Build the ribbon path - SNAKE STYLE
          // The wave pattern slides through the ribbon body over time
          const buildPath = (): Point[] => {
            const path: Point[] = [];
            const n = feeling.path.length;

            // Wave offset - makes the wave pattern slide through the ribbon
            // This creates the "snake slithering" effect
            const waveOffset = (headTravel * 2) % 1;

            for (let i = 0; i < n; i++) {
              // t=0 is the tail, t=1 is the head
              const t = i / (n - 1);

              // Time offset for this point (for entry animation)
              const timeOffset = (1 - t) * ribbonLength / (FLOW_SPEED * speedVariation);
              const pointAge = age - timeOffset;

              // Skip points that don't exist yet (ribbon is still entering)
              if (pointAge < 0) continue;

              // Screen X position
              const screenX = headX + (1 - t) * ribbonLength;

              // Sample the precomputed wave pattern (which is periodic)
              // waveOffset slides the pattern through the ribbon over time
              // We add t so different parts of the body show different parts of the wave
              const samplePos = ((waveOffset + t) % 1 + 1) % 1; // Ensure positive [0, 1)
              const sampleIndex = samplePos * n; // n points cover [0, 1)
              const idx0 = Math.floor(sampleIndex) % n;
              const idx1 = (idx0 + 1) % n; // Wraps around for seamless loop
              const frac = sampleIndex - Math.floor(sampleIndex);

              const [, y0] = feeling.path[idx0];
              const [, y1] = feeling.path[idx1];
              const baseY = y0 + (y1 - y0) * frac;

              // Subtle shimmer
              const shimmer =
                Math.sin(age * WAVE_FREQUENCY + t * Math.PI * 2) *
                WAVE_AMPLITUDE * 0.3;

              path.push({
                x: screenX,
                y: baseY + shimmer,
              });
            }

            return path;
          };

          const ribbonPath = buildPath();
          if (ribbonPath.length >= 2) {
            // Frustum culling - skip ribbons entirely off-screen
            let minX = Infinity, maxX = -Infinity;
            for (const pt of ribbonPath) {
              if (pt.x < minX) minX = pt.x;
              if (pt.x > maxX) maxX = pt.x;
            }
            // Skip if ribbon is completely outside visible area [0, 1]
            if (maxX < -0.1 || minX > 1.1) continue;

            drawRibbon(
              ribbonPath,
              feeling.color,
              alpha,
              thickness,
              glowStrength,
              particleSpawnRate,
              false
            );
            renderedCount++;
          }
        }

        // Update and draw ribbon particles
        for (let i = ribbonParticles.length - 1; i >= 0; i--) {
          const rp = ribbonParticles[i];
          rp.life -= p.deltaTime;

          if (rp.life <= 0) {
            ribbonParticles.splice(i, 1);
            continue;
          }

          // Gentle drift
          rp.x += rp.vx;
          rp.y += rp.vy;
          rp.vy *= 0.995; // Slow down vertical drift

          // Alpha with fade in/out, scaled by spawn position fadeScale
          const lifeRatio = rp.life / rp.maxLife;
          let rpAlpha: number;
          if (lifeRatio > 0.8) {
            rpAlpha = (1 - lifeRatio) / 0.2;
          } else if (lifeRatio < 0.3) {
            rpAlpha = lifeRatio / 0.3;
          } else {
            rpAlpha = 1;
          }
          rpAlpha *= rp.fadeScale; // Apply spawn position fade (dimmer at tail)

          // Draw particle - simplified for performance (no gradient)
          const { r, g, b } = getCachedRgb(rp.color);

          // Simple circles instead of gradient (much faster)
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${rpAlpha * 0.2})`;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, rp.size * 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `rgba(255, 255, 255, ${rpAlpha * 0.6})`;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, rp.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      };
    };

    p5InstanceRef.current = new p5Module(sketch, containerRef.current);

    return () => {
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
        p5InstanceRef.current = null;
      }
    };
  }, [p5Module]);

  return <div ref={containerRef} className="fixed inset-0 w-full h-full gpu-accelerated" />;
}
