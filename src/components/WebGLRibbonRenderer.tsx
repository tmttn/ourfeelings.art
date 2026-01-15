"use client";

import { useRef, useEffect, useCallback } from "react";
import type { Feeling } from "@/types";

interface WebGLRibbonRendererProps {
  feelings: Feeling[];
  maxVisibleRibbons?: number;
  isMobile?: boolean;
  reducedMotion?: boolean;
  enableGlow?: boolean;
  targetParticles?: number;
}

// Vertex shader that samples path from texture and uses Catmull-Rom interpolation
const VERTEX_SHADER = `#version 300 es
precision highp float;

// Per-vertex attributes
in vec2 a_position;      // x: 0-1 along ribbon, y: -1 to 1 perpendicular offset

// Per-instance attributes
in vec3 a_color;
in float a_alpha;
in float a_thickness;
in float a_headX;        // Current X position of ribbon head (0-1 screen)
in float a_ribbonLength; // Length of ribbon in screen units
in float a_pathIndex;    // Which row in path texture this ribbon uses
in float a_pathLength;   // Number of valid points in this ribbon's path
in float a_waveOffset;   // Wave offset for snake animation (0-1)
in float a_vitality;     // Vitality factor (1=fresh, 0=dying) for amplitude scaling

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_glowPass;
uniform sampler2D u_pathTexture;
uniform float u_pathTextureHeight;
uniform float u_pathTextureWidth;

const int RIBBON_SEGMENTS = 500;

out vec4 v_color;
out float v_progress;
out vec2 v_uv;

// Catmull-Rom interpolation
float catmullRom(float p0, float p1, float p2, float p3, float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

// Derivative of Catmull-Rom interpolation for smooth tangent calculation
float catmullRomDerivative(float p0, float p1, float p2, float p3, float t) {
  float t2 = t * t;
  return 0.5 * (
    (-p0 + p2) +
    2.0 * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t +
    3.0 * (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t2
  );
}

// Second derivative of Catmull-Rom for curvature estimation
float catmullRomSecondDerivative(float p0, float p1, float p2, float p3, float t) {
  return 0.5 * (
    2.0 * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) +
    6.0 * (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t
  );
}

void main() {
  float t = a_position.x; // 0 = tail, 1 = head

  // Sample path from texture
  // Path texture: each row is a ribbon, each column is a control point
  float pathPoints = a_pathLength;
  int row = int(a_pathIndex);

  // Snake animation: wave travels along ribbon
  // waveOffset is pre-normalized (headTravel / ribbonLength) on CPU
  float samplePos = fract(t + a_waveOffset);

  // Find which segment we're in (periodic path)
  float scaledT = samplePos * pathPoints;
  float segmentIndex = floor(scaledT);
  float segmentT = fract(scaledT);

  // Periodic index wrapping for seamless snake animation
  float i0 = mod(segmentIndex - 1.0 + pathPoints, pathPoints);
  float i1 = mod(segmentIndex, pathPoints);
  float i2 = mod(segmentIndex + 1.0, pathPoints);
  float i3 = mod(segmentIndex + 2.0, pathPoints);

  // Sample Y values from path texture using texelFetch for exact pixel access
  float y0 = texelFetch(u_pathTexture, ivec2(int(i0), row), 0).r;
  float y1 = texelFetch(u_pathTexture, ivec2(int(i1), row), 0).r;
  float y2 = texelFetch(u_pathTexture, ivec2(int(i2), row), 0).r;
  float y3 = texelFetch(u_pathTexture, ivec2(int(i3), row), 0).r;

  // Interpolate Y using Catmull-Rom
  float pathY_interp = catmullRom(y0, y1, y2, y3, segmentT);

  // Vitality only slightly reduces wave amplitude (keeps ribbons spread out)
  float amplitudeScale = 0.85 + 0.15 * a_vitality; // 85% to 100%
  pathY_interp = 0.5 + (pathY_interp - 0.5) * amplitudeScale;

  // Calculate aspect ratio for tangent calculations (used later)
  float aspectRatio = u_resolution.x / u_resolution.y;

  // Calculate tangent using Catmull-Rom derivative (analytically smooth)
  float dydt = catmullRomDerivative(y0, y1, y2, y3, segmentT) * (pathPoints - 1.0);

  // Calculate ribbon center position
  float screenX = a_headX + (1.0 - t) * a_ribbonLength;
  float screenY = pathY_interp;

  // Tangent direction: dx/dt = -ribbonLength (ribbon flows right to left), dy/dt from derivative
  // Note: dx is negative because screenX decreases as t increases
  // IMPORTANT: Scale by aspect ratio so ribbons look consistent across screen orientations
  float dx = -a_ribbonLength * aspectRatio; // Scale X by aspect ratio (aspectRatio defined above)
  float dy = dydt;
  float tangentLen = sqrt(dx * dx + dy * dy);

  // Perpendicular direction (rotate tangent 90 degrees)
  vec2 perpendicular = tangentLen > 0.0001 ? vec2(-dy, dx) / tangentLen : vec2(0.0, 1.0);

  // CRITICAL FIX: Clamp perpendicular X component to prevent miter spikes
  // When the ribbon turns sharply, the perpendicular can point mostly horizontal
  // which causes triangles to form spike shapes. Limit this.
  float maxPerpX = 0.3;
  if (abs(perpendicular.x) > maxPerpX) {
    // Keep direction but limit horizontal component
    float sign_x = perpendicular.x > 0.0 ? 1.0 : -1.0;
    perpendicular.x = sign_x * maxPerpX;
    // Re-normalize to maintain unit length
    perpendicular = normalize(perpendicular);
  }

  // Width tapers smoothly from tail (20%) to head (100%)
  float widthRatio = 0.2 + 0.8 * pow(t, 0.5);

  // Rounded head - make the last 5% of ribbon curve into a semicircle
  if (t > 0.95) {
    float headT = (t - 0.95) / 0.05;
    float headCurve = cos(headT * 1.5708); // cos(0 to pi/2) = 1 to 0
    widthRatio *= headCurve;
  }

  float halfWidth = a_thickness * widthRatio * 0.5 / u_resolution.y;

  // For glow pass, make ribbons wider
  if (u_glowPass > 0.5) {
    halfWidth *= 1.8;
  }

  // Apply perpendicular offset
  screenX += perpendicular.x * a_position.y * halfWidth * u_resolution.y / u_resolution.x;
  screenY += perpendicular.y * a_position.y * halfWidth;

  // Convert to clip space
  vec2 clipPos = vec2(
    screenX * 2.0 - 1.0,
    1.0 - screenY * 2.0
  );

  gl_Position = vec4(clipPos, 0.0, 1.0);

  // Color output with fade gradient
  float fadeGradient = smoothstep(0.0, 0.3, t);
  float alpha = a_alpha * fadeGradient;

  // Lighter color for core, full color for edges
  float edgeFactor = abs(a_position.y);
  vec3 color = mix(a_color * 1.3, a_color, edgeFactor * 0.5);
  color = min(color, vec3(1.0));

  // DEBUG: Show sampled Y value as red intensity
  // color = vec3(y1, 0.0, 0.0);

  v_color = vec4(color, alpha);
  v_progress = t;
  v_uv = vec2(t, a_position.y * 0.5 + 0.5);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
in float v_progress;
in vec2 v_uv;

uniform float u_glowPass;

out vec4 fragColor;

void main() {
  vec3 color = v_color.rgb;
  float alpha = v_color.a;

  // Soft edges
  float edgeDist = abs(v_uv.y - 0.5) * 2.0;
  float edgeSoftness = 1.0 - smoothstep(0.6, 1.0, edgeDist);

  if (u_glowPass > 0.5) {
    // Glow pass - softer, more spread out
    alpha *= 0.25 * edgeSoftness * edgeSoftness;
    // Add bloom effect - brighter in center
    color = mix(color, vec3(1.0), 0.3 * (1.0 - edgeDist));
  } else {
    // Main pass - crisp with soft edges
    alpha *= edgeSoftness;
    // Lighten the core
    color = mix(color, vec3(1.0), (1.0 - edgeDist) * 0.15);
  }

  // Premultiplied alpha
  fragColor = vec4(color * alpha, alpha);
}
`;

// Particle shaders
const PARTICLE_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec3 a_color;
in float a_alpha;
in float a_size;

uniform vec2 u_resolution;

out vec4 v_color;
out float v_size;

void main() {
  vec2 clipPos = vec2(
    a_position.x / u_resolution.x * 2.0 - 1.0,
    1.0 - a_position.y / u_resolution.y * 2.0
  );

  gl_Position = vec4(clipPos, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = vec4(a_color, a_alpha);
  v_size = a_size;
}
`;

const PARTICLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
in float v_size;

out vec4 fragColor;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);

  // Soft circular gradient with glow
  float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
  float glow = exp(-dist * dist * 8.0) * 0.5;
  alpha = max(alpha, glow);

  fragColor = vec4(v_color.rgb * v_color.a * alpha, v_color.a * alpha);
}
`;

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function hexToRgb(hex: string): [number, number, number] {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (match) {
    return [
      parseInt(match[1], 16) / 255,
      parseInt(match[2], 16) / 255,
      parseInt(match[3], 16) / 255,
    ];
  }
  return [1, 1, 1];
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  return min + (x - Math.floor(x)) * (max - min);
}

const FLOW_SPEED = 0.00002;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const RIBBON_SEGMENTS = 500; // High segment count for smooth Catmull-Rom curves (~5 per path point)
const MAX_PATH_POINTS = 100; // Support both old (100) and new (32) path formats

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: [number, number, number];
  alpha: number;
  size: number;
  life: number;
  maxLife: number;
}

// Cache for per-feeling computed values
interface FeelingCache {
  hash: number;
  rgb: [number, number, number];
  baseRibbonLength: number;
  baseThickness: number;
  baseSpeedVariation: number;
}

export default function WebGLRibbonRenderer({
  feelings,
  maxVisibleRibbons = 500,
  isMobile = false,
  reducedMotion = false,
  enableGlow = true,
  targetParticles = 30,
}: WebGLRibbonRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const feelingsRef = useRef<Feeling[]>(feelings);
  const particlesRef = useRef<Particle[]>([]);

  // Caches for performance
  const sortedFeelingsRef = useRef<Feeling[]>([]);
  const feelingsCacheRef = useRef<Map<string, FeelingCache>>(new Map());
  const lastFeelingsLengthRef = useRef<number>(0);

  useEffect(() => {
    feelingsRef.current = feelings;

    // Only re-sort and rebuild cache when feelings array changes
    if (feelings.length !== lastFeelingsLengthRef.current ||
        feelings[0]?.id !== sortedFeelingsRef.current[0]?.id) {
      // Sort by creation time (oldest first)
      sortedFeelingsRef.current = [...feelings].sort((a, b) => a.createdAt - b.createdAt);
      lastFeelingsLengthRef.current = feelings.length;

      // Build/update per-feeling cache
      const cache = feelingsCacheRef.current;
      for (const feeling of feelings) {
        if (!cache.has(feeling.id)) {
          const hash = hashString(feeling.id);
          cache.set(feeling.id, {
            hash,
            rgb: hexToRgb(feeling.color),
            baseRibbonLength: seededRandom(hash, 0.4, 0.9),
            baseThickness: seededRandom(hash + 1, 16, 36),
            baseSpeedVariation: seededRandom(hash + 3, 0.85, 1.15),
          });
        }
      }
    }
  }, [feelings]);

  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });

    if (!gl) {
      console.error('WebGL2 not supported');
      return null;
    }

    // Create ribbon program
    const ribbonVS = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const ribbonFS = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!ribbonVS || !ribbonFS) return null;
    const ribbonProgram = createProgram(gl, ribbonVS, ribbonFS);
    if (!ribbonProgram) return null;

    // Create particle program
    const particleVS = createShader(gl, gl.VERTEX_SHADER, PARTICLE_VERTEX_SHADER);
    const particleFS = createShader(gl, gl.FRAGMENT_SHADER, PARTICLE_FRAGMENT_SHADER);
    if (!particleVS || !particleFS) return null;
    const particleProgram = createProgram(gl, particleVS, particleFS);
    if (!particleProgram) return null;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Enable floating point texture support
    const ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) {
      console.warn('EXT_color_buffer_float not available, float textures may not work');
    }

    return { gl, ribbonProgram, particleProgram };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio, isMobile ? 1 : 2);

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    resize();
    window.addEventListener('resize', resize);

    const result = initWebGL();
    if (!result) return;

    const { gl, ribbonProgram, particleProgram } = result;

    gl.viewport(0, 0, canvas.width, canvas.height);

    // Get attribute and uniform locations
    const r_positionLoc = gl.getAttribLocation(ribbonProgram, 'a_position');
    const r_colorLoc = gl.getAttribLocation(ribbonProgram, 'a_color');
    const r_alphaLoc = gl.getAttribLocation(ribbonProgram, 'a_alpha');
    const r_thicknessLoc = gl.getAttribLocation(ribbonProgram, 'a_thickness');
    const r_headXLoc = gl.getAttribLocation(ribbonProgram, 'a_headX');
    const r_ribbonLengthLoc = gl.getAttribLocation(ribbonProgram, 'a_ribbonLength');
    const r_pathIndexLoc = gl.getAttribLocation(ribbonProgram, 'a_pathIndex');
    const r_pathLengthLoc = gl.getAttribLocation(ribbonProgram, 'a_pathLength');
    const r_waveOffsetLoc = gl.getAttribLocation(ribbonProgram, 'a_waveOffset');
    const r_vitalityLoc = gl.getAttribLocation(ribbonProgram, 'a_vitality');
    const r_resolutionLoc = gl.getUniformLocation(ribbonProgram, 'u_resolution');
    const r_timeLoc = gl.getUniformLocation(ribbonProgram, 'u_time');
    const r_glowPassLoc = gl.getUniformLocation(ribbonProgram, 'u_glowPass');
    const r_pathTextureLoc = gl.getUniformLocation(ribbonProgram, 'u_pathTexture');
    const r_pathTextureHeightLoc = gl.getUniformLocation(ribbonProgram, 'u_pathTextureHeight');
    const r_pathTextureWidthLoc = gl.getUniformLocation(ribbonProgram, 'u_pathTextureWidth');

    const p_positionLoc = gl.getAttribLocation(particleProgram, 'a_position');
    const p_colorLoc = gl.getAttribLocation(particleProgram, 'a_color');
    const p_alphaLoc = gl.getAttribLocation(particleProgram, 'a_alpha');
    const p_sizeLoc = gl.getAttribLocation(particleProgram, 'a_size');
    const p_resolutionLoc = gl.getUniformLocation(particleProgram, 'u_resolution');

    // Create ribbon geometry - triangle strip
    const ribbonGeometry = new Float32Array(RIBBON_SEGMENTS * 2 * 2); // x, y_perp per vertex
    for (let i = 0; i < RIBBON_SEGMENTS; i++) {
      const t = i / (RIBBON_SEGMENTS - 1);
      const idx = i * 4;
      // Top vertex
      ribbonGeometry[idx + 0] = t;
      ribbonGeometry[idx + 1] = 1;
      // Bottom vertex
      ribbonGeometry[idx + 2] = t;
      ribbonGeometry[idx + 3] = -1;
    }

    // Create index buffer for triangle strip as triangles
    const indices = new Uint16Array((RIBBON_SEGMENTS - 1) * 6);
    for (let i = 0; i < RIBBON_SEGMENTS - 1; i++) {
      const idx = i * 6;
      const v = i * 2;
      indices[idx + 0] = v;
      indices[idx + 1] = v + 1;
      indices[idx + 2] = v + 2;
      indices[idx + 3] = v + 1;
      indices[idx + 4] = v + 3;
      indices[idx + 5] = v + 2;
    }

    // Create VAO for ribbons
    const ribbonVAO = gl.createVertexArray();
    gl.bindVertexArray(ribbonVAO);

    const geometryBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, ribbonGeometry, gl.STATIC_DRAW);

    const setupAttr = (loc: number, size: number, stride: number, offset: number, divisor = 0) => {
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
        if (divisor > 0) gl.vertexAttribDivisor(loc, divisor);
      }
    };

    // Position: 2 floats, stride 8 bytes (2 floats * 4)
    setupAttr(r_positionLoc, 2, 8, 0);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Instance buffer: color(3) + alpha(1) + thickness(1) + headX(1) + ribbonLength(1) + pathIndex(1) + pathLength(1) + waveOffset(1) + vitality(1) = 11 floats
    const instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);

    const INSTANCE_FLOATS = 11;
    const INSTANCE_BYTES = INSTANCE_FLOATS * 4;

    setupAttr(r_colorLoc, 3, INSTANCE_BYTES, 0, 1);
    setupAttr(r_alphaLoc, 1, INSTANCE_BYTES, 12, 1);
    setupAttr(r_thicknessLoc, 1, INSTANCE_BYTES, 16, 1);
    setupAttr(r_headXLoc, 1, INSTANCE_BYTES, 20, 1);
    setupAttr(r_ribbonLengthLoc, 1, INSTANCE_BYTES, 24, 1);
    setupAttr(r_pathIndexLoc, 1, INSTANCE_BYTES, 28, 1);
    setupAttr(r_pathLengthLoc, 1, INSTANCE_BYTES, 32, 1);
    setupAttr(r_waveOffsetLoc, 1, INSTANCE_BYTES, 36, 1);
    setupAttr(r_vitalityLoc, 1, INSTANCE_BYTES, 40, 1);

    // Create path texture (using NEAREST filtering for texelFetch)
    const pathTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, pathTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Particle VAO
    const particleVAO = gl.createVertexArray();
    gl.bindVertexArray(particleVAO);

    const particleBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);

    const PARTICLE_FLOATS = 7;
    const PARTICLE_BYTES = PARTICLE_FLOATS * 4;

    setupAttr(p_positionLoc, 2, PARTICLE_BYTES, 0);
    setupAttr(p_colorLoc, 3, PARTICLE_BYTES, 8);
    setupAttr(p_alphaLoc, 1, PARTICLE_BYTES, 20);
    setupAttr(p_sizeLoc, 1, PARTICLE_BYTES, 24);

    gl.bindVertexArray(null);

    const maxRibbons = Math.min(isFinite(maxVisibleRibbons) ? maxVisibleRibbons : 5000, 5000);
    const instanceData = new Float32Array(maxRibbons * INSTANCE_FLOATS);
    const maxParticles = targetParticles * 3;
    const particleData = new Float32Array(maxParticles * PARTICLE_FLOATS);

    // Path texture data - will be updated each frame
    const pathTextureData = new Float32Array(MAX_PATH_POINTS * maxRibbons);

    const particles = particlesRef.current;

    const ambientColors: [number, number, number][] = [
      [0.29, 0.33, 0.41],
      [0.33, 0.24, 0.60],
      [0.17, 0.42, 0.69],
      [0.16, 0.37, 0.38],
    ];

    const spawnParticle = (x?: number, y?: number, color?: [number, number, number]) => {
      if (particles.length >= maxParticles) return;

      const c = color || ambientColors[Math.floor(Math.random() * ambientColors.length)];
      particles.push({
        x: x ?? Math.random() * canvas.width,
        y: y ?? Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        color: c,
        alpha: 0.3 + Math.random() * 0.3,
        size: 2 + Math.random() * 4,
        life: 3000 + Math.random() * 5000,
        maxLife: 0,
      });
      particles[particles.length - 1].maxLife = particles[particles.length - 1].life;
    };

    // Seed initial particles
    for (let i = 0; i < targetParticles; i++) {
      spawnParticle();
    }

    let lastTime = performance.now();
    const targetFrameTime = reducedMotion ? 50 : (isMobile ? 33.33 : 16.67);

    const render = () => {
      const now = performance.now();
      const deltaTime = now - lastTime;

      if (deltaTime < targetFrameTime) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      lastTime = now;
      const time = Date.now();

      gl.viewport(0, 0, canvas.width, canvas.height);

      // Calculate aspect ratio correction for consistent visual appearance across screen sizes
      // Reference aspect ratio is 16:9 (landscape desktop) - ribbons should look similar regardless of screen shape
      const aspectRatio = canvas.width / canvas.height;
      const REFERENCE_ASPECT = 16 / 9; // ~1.78
      // Scale ribbon length to compensate for aspect ratio difference from reference
      // On portrait (aspectRatio < 1), ribbons need to be much longer to maintain visual proportions
      const ribbonLengthMultiplier = Math.min(3.0, REFERENCE_ASPECT / aspectRatio);
      gl.clearColor(0.04, 0.04, 0.07, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Use cached sorted feelings
      const sortedFeelings = sortedFeelingsRef.current;
      const totalFeelings = sortedFeelings.length;
      const feelingsCache = feelingsCacheRef.current;

      // Build ribbon instance data and path texture
      let ribbonCount = 0;
      const ribbonPositions: { x: number; y: number; color: [number, number, number] }[] = [];

      for (let fi = 0; fi < totalFeelings && ribbonCount < maxRibbons; fi++) {
        const feeling = sortedFeelings[fi];

        // Skip feelings without valid path
        if (!feeling.path || feeling.path.length < 2) continue;

        // Stagger entry: older ribbons wait longer, newer ones appear immediately
        // Reverse the index so newest (last in sorted array) has staggerDelay of 0
        const reverseIndex = totalFeelings - 1 - fi;
        const staggerDelay = Math.min(reverseIndex * 500, 60000);
        const age = time - feeling.createdAt - staggerDelay;
        if (age < 0) continue;

        // Use cached per-feeling values
        const cached = feelingsCache.get(feeling.id);
        if (!cached) continue;
        const { baseRibbonLength, baseThickness, baseSpeedVariation, rgb } = cached;

        const ageRatio = Math.min(1, age / SEVEN_DAYS_MS);
        const vitality = 1 - Math.pow(ageRatio, 0.7);

        let alpha: number;
        const fadeInDuration = 3000;
        if (age < fadeInDuration) {
          alpha = (age / fadeInDuration) * vitality;
        } else {
          alpha = vitality;
        }

        if (alpha < 0.01) continue;

        const ribbonLength = baseRibbonLength * (0.4 + vitality * 0.6) * ribbonLengthMultiplier;
        const thickness = baseThickness * (0.4 + vitality * 0.6);
        const speedVariation = baseSpeedVariation * (0.5 + vitality * 0.7);

        const headTravel = age * FLOW_SPEED * speedVariation;
        const cycleLength = 1.0 + ribbonLength;
        const headX = 1.0 - (headTravel % cycleLength);

        const tailX = headX + ribbonLength;
        if (headX > 1.3 || tailX < -0.3) continue;

        const [r, g, b] = rgb;

        // Wave offset - precompute division for better GPU performance
        const waveOffset = headTravel / ribbonLength;

        // Write instance data
        const pathLen = Math.min(feeling.path.length, MAX_PATH_POINTS);
        const idx = ribbonCount * INSTANCE_FLOATS;
        instanceData[idx + 0] = r;
        instanceData[idx + 1] = g;
        instanceData[idx + 2] = b;
        instanceData[idx + 3] = alpha;
        instanceData[idx + 4] = thickness;
        instanceData[idx + 5] = headX;
        instanceData[idx + 6] = ribbonLength;
        instanceData[idx + 7] = ribbonCount; // Path index
        instanceData[idx + 8] = pathLen;     // Path length
        instanceData[idx + 9] = waveOffset;  // Wave offset for snake animation
        instanceData[idx + 10] = vitality;   // Vitality for amplitude scaling

        // Write path data to texture
        // The path is stored as [x, y] pairs, we only need Y values
        const pathOffset = ribbonCount * MAX_PATH_POINTS;
        for (let pi = 0; pi < pathLen; pi++) {
          pathTextureData[pathOffset + pi] = feeling.path[pi][1]; // Y coordinate
        }
        // Pad remaining with last value
        for (let pi = pathLen; pi < MAX_PATH_POINTS; pi++) {
          pathTextureData[pathOffset + pi] = feeling.path[pathLen - 1][1];
        }

        // Spawn particles from ribbons
        if (Math.random() < 0.015 * vitality && particles.length < maxParticles) {
          const spawnT = Math.random();
          const pathIdx = Math.floor(spawnT * (feeling.path.length - 1));
          const spawnX = (headX + (1 - spawnT) * ribbonLength) * canvas.width;
          const spawnY = feeling.path[pathIdx][1] * canvas.height;
          ribbonPositions.push({ x: spawnX, y: spawnY, color: [r, g, b] });
        }

        ribbonCount++;
      }

      // Spawn ribbon particles
      for (const pos of ribbonPositions) {
        spawnParticle(pos.x, pos.y, pos.color);
      }

      // Update particles (swap-and-pop for O(1) removal)
      let i = 0;
      while (i < particles.length) {
        const p = particles[i];
        p.life -= deltaTime;

        if (p.life <= 0) {
          // Swap with last element and pop (O(1) instead of splice's O(n))
          particles[i] = particles[particles.length - 1];
          particles.pop();
          continue; // Don't increment i, check the swapped element
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.vy *= 0.99;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        i++;
      }

      while (particles.length < targetParticles) {
        spawnParticle();
      }

      // Update path texture
      if (ribbonCount > 0) {
        gl.bindTexture(gl.TEXTURE_2D, pathTexture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.R32F,
          MAX_PATH_POINTS,
          ribbonCount,
          0,
          gl.RED,
          gl.FLOAT,
          pathTextureData.subarray(0, MAX_PATH_POINTS * ribbonCount)
        );

        // Draw ribbons
        gl.useProgram(ribbonProgram);
        gl.bindVertexArray(ribbonVAO);

        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, instanceData.subarray(0, ribbonCount * INSTANCE_FLOATS), gl.DYNAMIC_DRAW);

        gl.uniform2f(r_resolutionLoc, canvas.width, canvas.height);
        gl.uniform1f(r_timeLoc, time * 0.001);
        gl.uniform1i(r_pathTextureLoc, 0);
        gl.uniform1f(r_pathTextureHeightLoc, ribbonCount);
        gl.uniform1f(r_pathTextureWidthLoc, MAX_PATH_POINTS);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pathTexture);

        // Draw glow pass first
        if (enableGlow && !isMobile) {
          gl.uniform1f(r_glowPassLoc, 1.0);
          gl.drawElementsInstanced(gl.TRIANGLES, (RIBBON_SEGMENTS - 1) * 6, gl.UNSIGNED_SHORT, 0, ribbonCount);
        }

        // Draw main pass
        gl.uniform1f(r_glowPassLoc, 0.0);
        gl.drawElementsInstanced(gl.TRIANGLES, (RIBBON_SEGMENTS - 1) * 6, gl.UNSIGNED_SHORT, 0, ribbonCount);
      }

      // Draw particles
      if (particles.length > 0) {
        gl.useProgram(particleProgram);
        gl.bindVertexArray(particleVAO);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const lifeRatio = p.life / p.maxLife;
          let alpha = p.alpha;
          if (lifeRatio > 0.8) alpha *= (1 - lifeRatio) / 0.2;
          else if (lifeRatio < 0.2) alpha *= lifeRatio / 0.2;

          const idx = i * PARTICLE_FLOATS;
          particleData[idx + 0] = p.x;
          particleData[idx + 1] = p.y;
          particleData[idx + 2] = p.color[0];
          particleData[idx + 3] = p.color[1];
          particleData[idx + 4] = p.color[2];
          particleData[idx + 5] = alpha;
          particleData[idx + 6] = p.size * dpr;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, particleData.subarray(0, particles.length * PARTICLE_FLOATS), gl.DYNAMIC_DRAW);

        gl.uniform2f(p_resolutionLoc, canvas.width, canvas.height);
        gl.drawArrays(gl.POINTS, 0, particles.length);
      }

      gl.bindVertexArray(null);
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameRef.current);
      gl.deleteProgram(ribbonProgram);
      gl.deleteProgram(particleProgram);
      gl.deleteBuffer(geometryBuffer);
      gl.deleteBuffer(instanceBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteBuffer(particleBuffer);
      gl.deleteTexture(pathTexture);
      gl.deleteVertexArray(ribbonVAO);
      gl.deleteVertexArray(particleVAO);
    };
  }, [initWebGL, isMobile, reducedMotion, maxVisibleRibbons, enableGlow, targetParticles]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ background: '#0a0a12' }}
    />
  );
}
