"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/lib/useIsMobile";

export type RendererMode = "auto" | "webgl" | "canvas";

export interface PerformanceSettings {
  maxVisibleRibbons: number; // Infinity means unlimited (show all)
  catmullRomSegments: number;
  enableGlow: boolean;
  targetParticles: number;
  renderer: RendererMode; // "auto" = WebGL if supported, "webgl" = force WebGL, "canvas" = force 2D canvas
}

// Slider steps for ribbons: 10, 20, 50, 100, 200, 500, 1000, 2000, Infinity
const RIBBON_STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, Infinity];

function ribbonValueToSlider(value: number): number {
  if (!isFinite(value)) return RIBBON_STEPS.length - 1;
  const idx = RIBBON_STEPS.findIndex((step) => step >= value);
  return idx === -1 ? RIBBON_STEPS.length - 1 : idx;
}

function sliderToRibbonValue(sliderValue: number): number {
  return RIBBON_STEPS[Math.round(sliderValue)] ?? Infinity;
}

function formatRibbonValue(value: number): string {
  if (!isFinite(value)) return "All";
  return String(value);
}

// Calculate optimal settings based on feelings count and device type
// With WebGL instancing, we can handle much higher counts
export function getAdaptiveSettings(feelingsCount: number, isMobile: boolean = false): PerformanceSettings {
  if (isMobile) {
    // Mobile: WebGL allows higher ribbon counts than 2D canvas
    if (feelingsCount <= 50) {
      return {
        maxVisibleRibbons: 50,
        catmullRomSegments: 2,
        enableGlow: false,
        targetParticles: 10,
        renderer: "auto",
      };
    } else if (feelingsCount <= 200) {
      return {
        maxVisibleRibbons: 100,
        catmullRomSegments: 2,
        enableGlow: false,
        targetParticles: 5,
        renderer: "auto",
      };
    } else if (feelingsCount <= 500) {
      return {
        maxVisibleRibbons: 150,
        catmullRomSegments: 2,
        enableGlow: false,
        targetParticles: 3,
        renderer: "auto",
      };
    } else {
      // 500+ feelings on mobile
      return {
        maxVisibleRibbons: 200,
        catmullRomSegments: 2,
        enableGlow: false,
        targetParticles: 0,
        renderer: "auto",
      };
    }
  }

  // Desktop settings - WebGL instancing allows thousands of ribbons
  if (feelingsCount <= 100) {
    return {
      maxVisibleRibbons: 100,
      catmullRomSegments: 4,
      enableGlow: false,
      targetParticles: 25,
      renderer: "auto",
    };
  } else if (feelingsCount <= 500) {
    return {
      maxVisibleRibbons: 500,
      catmullRomSegments: 3,
      enableGlow: false,
      targetParticles: 20,
      renderer: "auto",
    };
  } else if (feelingsCount <= 1000) {
    return {
      maxVisibleRibbons: 1000,
      catmullRomSegments: 3,
      enableGlow: false,
      targetParticles: 15,
      renderer: "auto",
    };
  } else if (feelingsCount <= 2000) {
    return {
      maxVisibleRibbons: 1500,
      catmullRomSegments: 2,
      enableGlow: false,
      targetParticles: 10,
      renderer: "auto",
    };
  } else {
    // 2000+ feelings - still performant with WebGL
    return {
      maxVisibleRibbons: 2000,
      catmullRomSegments: 2,
      enableGlow: false,
      targetParticles: 5,
      renderer: "auto",
    };
  }
}

// Mobile default settings (heavier optimization)
export const MOBILE_DEFAULT_SETTINGS: PerformanceSettings = {
  maxVisibleRibbons: 100, // WebGL can handle more
  catmullRomSegments: 2,
  enableGlow: false,
  targetParticles: 5,
  renderer: "auto",
};

// Desktop default - WebGL allows much higher ribbon counts
export const DEFAULT_SETTINGS: PerformanceSettings = {
  maxVisibleRibbons: 500, // WebGL instancing can handle thousands
  catmullRomSegments: 3,
  enableGlow: false,
  targetParticles: 20,
  renderer: "auto",
};

interface SettingsProps {
  settings: PerformanceSettings;
  onSettingsChange: (settings: PerformanceSettings) => void;
  feelingsCount: number;
  visible?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export default function Settings({
  settings,
  onSettingsChange,
  feelingsCount,
  visible = true,
  onOpenChange,
}: SettingsProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpenInternal] = useState(false);

  // Wrapper to notify parent when open state changes
  const setIsOpen = (open: boolean) => {
    setIsOpenInternal(open);
    onOpenChange?.(open);
  };
  const [showHint, setShowHint] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hide hint after first interaction or after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleChange = (key: keyof PerformanceSettings, value: number | boolean | RendererMode) => {
    const newSettings = { ...settings, [key]: value };

    // Auto-disable glow when ribbons >= 500
    if (key === "maxVisibleRibbons" && typeof value === "number" && value >= 500) {
      newSettings.enableGlow = false;
    }

    onSettingsChange(newSettings);
  };

  // Check if glow can be enabled (only when fewer than 500 feelings, never on mobile)
  const canEnableGlow = !isMobile && feelingsCount < 500;

  const applyAdaptive = () => {
    onSettingsChange(getAdaptiveSettings(feelingsCount, isMobile));
  };

  return (
    <motion.div
      ref={containerRef}
      className={`fixed z-50 ${isMobile ? "top-4 right-4" : "top-8 right-8"}`}
      animate={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
      transition={{ duration: 0.8 }}
    >
      {/* Hint label - hidden on mobile */}
      <AnimatePresence>
        {showHint && !isOpen && !isMobile && (
          <motion.span
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute right-12 top-1/2 -translate-y-1/2 text-xs text-white/25 font-light tracking-wide whitespace-nowrap pointer-events-none"
          >
            adjust visuals
          </motion.span>
        )}
      </AnimatePresence>

      {/* Cogwheel toggle */}
      <motion.button
        onClick={() => {
          setIsOpen(!isOpen);
          setShowHint(false);
        }}
        className={`group rounded-xl transition-all duration-300 ${isMobile ? "p-3" : "p-2.5"}`}
        style={{
          background: isOpen
            ? "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)"
            : "transparent",
          backdropFilter: isOpen ? "blur(12px)" : "none",
          WebkitBackdropFilter: isOpen ? "blur(12px)" : "none",
          border: isOpen ? "1px solid rgba(255,255,255,0.15)" : "1px solid transparent",
          boxShadow: isOpen ? "0 4px 16px rgba(0,0,0,0.2)" : "none",
        }}
        whileHover={!isMobile ? {
          background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
        } : undefined}
        aria-label="Settings"
      >
        <motion.svg
          className={`text-white/30 group-hover:text-white/50 transition-colors duration-300 ${isMobile ? "w-6 h-6" : "w-5 h-5"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </motion.svg>
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className={`absolute top-14 right-0 rounded-2xl shadow-2xl ${isMobile ? "w-72" : "w-80"}`}
            style={{
              background: "linear-gradient(135deg, rgba(20,20,30,0.92) 0%, rgba(15,15,25,0.95) 100%)",
              backdropFilter: "blur(32px) saturate(150%)",
              WebkitBackdropFilter: "blur(32px) saturate(150%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            {/* Subtle top highlight */}
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
              }}
            />

            <div className={isMobile ? "!p-5 !space-y-6" : "!p-7 !space-y-8"}>
              {/* Ribbons */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50 font-medium tracking-wide">Ribbons</span>
                  <span className="text-sm tabular-nums text-white/70 font-medium">
                    {formatRibbonValue(settings.maxVisibleRibbons)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={RIBBON_STEPS.length - 1}
                  step="1"
                  value={ribbonValueToSlider(settings.maxVisibleRibbons)}
                  onChange={(e) => handleChange("maxVisibleRibbons", sliderToRibbonValue(Number(e.target.value)))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer transition-all duration-200
                    [&::-webkit-slider-runnable-track]:rounded-full
                    [&::-webkit-slider-runnable-track]:bg-white/10
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-white/80
                    [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(255,255,255,0.3)]
                    [&::-webkit-slider-thumb]:transition-all
                    [&::-webkit-slider-thumb]:duration-200
                    [&::-webkit-slider-thumb]:hover:bg-white
                    [&::-webkit-slider-thumb]:hover:shadow-[0_0_14px_rgba(255,255,255,0.5)]"
                />
              </div>

              {/* Smoothness */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50 font-medium tracking-wide">Smoothness</span>
                  <span className="text-sm tabular-nums text-white/70 font-medium">
                    {settings.catmullRomSegments}
                  </span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="8"
                  step="1"
                  value={settings.catmullRomSegments}
                  onChange={(e) => handleChange("catmullRomSegments", Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer transition-all duration-200
                    [&::-webkit-slider-runnable-track]:rounded-full
                    [&::-webkit-slider-runnable-track]:bg-white/10
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-white/80
                    [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(255,255,255,0.3)]
                    [&::-webkit-slider-thumb]:transition-all
                    [&::-webkit-slider-thumb]:duration-200
                    [&::-webkit-slider-thumb]:hover:bg-white
                    [&::-webkit-slider-thumb]:hover:shadow-[0_0_14px_rgba(255,255,255,0.5)]"
                />
              </div>

              {/* Particles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50 font-medium tracking-wide">Particles</span>
                  <span className="text-sm tabular-nums text-white/70 font-medium">
                    {settings.targetParticles}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="5"
                  value={settings.targetParticles}
                  onChange={(e) => handleChange("targetParticles", Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer transition-all duration-200
                    [&::-webkit-slider-runnable-track]:rounded-full
                    [&::-webkit-slider-runnable-track]:bg-white/10
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-white/80
                    [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(255,255,255,0.3)]
                    [&::-webkit-slider-thumb]:transition-all
                    [&::-webkit-slider-thumb]:duration-200
                    [&::-webkit-slider-thumb]:hover:bg-white
                    [&::-webkit-slider-thumb]:hover:shadow-[0_0_14px_rgba(255,255,255,0.5)]"
                />
              </div>

              {/* Divider */}
              <div
                className="h-px mx-2 my-1"
                style={{
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)",
                }}
              />

              {/* Glow toggle */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium tracking-wide transition-colors duration-200 ${
                      canEnableGlow ? "text-white/50" : "text-white/25"
                    }`}
                  >
                    Glow Effect
                  </span>
                  {!canEnableGlow && (
                    <span className="text-xs text-white/30 font-medium">
                      {isMobile ? "desktop only" : "<500"}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => canEnableGlow && handleChange("enableGlow", !settings.enableGlow)}
                  disabled={!canEnableGlow}
                  className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
                    !canEnableGlow
                      ? "bg-white/5 cursor-not-allowed"
                      : settings.enableGlow
                        ? "bg-white/25 shadow-[0_0_12px_rgba(255,255,255,0.2)]"
                        : "bg-white/10"
                  }`}
                  style={{
                    border: !canEnableGlow
                      ? "1px solid rgba(255,255,255,0.05)"
                      : settings.enableGlow
                        ? "1px solid rgba(255,255,255,0.3)"
                        : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <motion.span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-colors duration-200 ${
                      canEnableGlow ? "bg-white/90" : "bg-white/30"
                    }`}
                    animate={{
                      x: settings.enableGlow && canEnableGlow ? 20 : 0,
                      boxShadow: settings.enableGlow && canEnableGlow
                        ? "0 0 8px rgba(255,255,255,0.5)"
                        : "none"
                    }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  />
                </button>
              </div>

              {/* Renderer mode */}
              <div className="space-y-3">
                <span className="text-sm text-white/50 font-medium tracking-wide">Renderer</span>
                <div className="flex gap-2">
                  {(["auto", "webgl", "canvas"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleChange("renderer", mode)}
                      className={`flex-1 py-1.5 text-xs font-medium tracking-wide rounded-lg transition-all duration-200 ${
                        settings.renderer === mode
                          ? "text-white/90 bg-white/15"
                          : "text-white/40 hover:text-white/60 hover:bg-white/5"
                      }`}
                      style={{
                        border: settings.renderer === mode
                          ? "1px solid rgba(255,255,255,0.2)"
                          : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {mode === "auto" ? "Auto" : mode === "webgl" ? "WebGL" : "Canvas"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/25">
                  {settings.renderer === "auto" && "Uses WebGL if supported, falls back to Canvas"}
                  {settings.renderer === "webgl" && "GPU-accelerated, best for 1000+ ribbons"}
                  {settings.renderer === "canvas" && "2D Canvas, lower ribbon limit but more effects"}
                </p>
              </div>

              {/* Auto-optimize button */}
              <button
                onClick={applyAdaptive}
                className="w-full py-2.5 text-sm text-white/40 font-medium tracking-wide rounded-lg transition-all duration-200 hover:text-white/70 hover:bg-white/5"
                style={{
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                Auto-optimize
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
