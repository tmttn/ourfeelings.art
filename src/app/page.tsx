"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import P5Canvas from "@/components/P5Canvas";
import AmbientInfo from "@/components/AmbientInfo";
import EmotionPicker from "@/components/EmotionPicker";
import Settings, { DEFAULT_SETTINGS, MOBILE_DEFAULT_SETTINGS, type PerformanceSettings } from "@/components/Settings";
import InfoModal from "@/components/InfoModal";
import { useIsMobile, usePrefersReducedMotion } from "@/lib/useIsMobile";
import type { Feeling } from "@/types";
import type { Emotion } from "@/lib/emotions";

// Dynamically import WebGL renderer (only loaded when needed)
const WebGLRibbonRenderer = dynamic(() => import("@/components/WebGLRibbonRenderer"), {
  ssr: false,
  loading: () => null,
});

const POLL_INTERVAL = 15000; // 15 seconds when active
const POLL_INTERVAL_HIDDEN = 60000; // 60 seconds when tab is hidden
const IDLE_TIMEOUT = 3000; // 3 seconds of no interaction
const MOBILE_IDLE_TIMEOUT = 5000; // 5 seconds on mobile (longer since no hover)
const POST_ACTION_TIMEOUT = 10000; // 10 seconds after submitting to read rate limit message
const STORAGE_KEY = "river-of-feelings-hash";

// Reduced motion settings - minimal animation for accessibility
const REDUCED_MOTION_SETTINGS: PerformanceSettings = {
  maxVisibleRibbons: 20,
  catmullRomSegments: 2,
  enableGlow: false,
  targetParticles: 0, // No ambient particles
  renderer: "auto",
};

// Check if WebGL2 is supported
function checkWebGL2Support(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    return gl !== null;
  } catch {
    return false;
  }
}

export default function Home() {
  const isMobile = useIsMobile();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [feelings, setFeelings] = useState<Feeling[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [updateHash, setUpdateHash] = useState<string | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [rateLimitChecked, setRateLimitChecked] = useState(false);
  const [performanceSettings, setPerformanceSettings] = useState<PerformanceSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [uiPinned, setUiPinned] = useState(true);
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const rateLimitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasSetMobileDefaults = useRef(false);
  const etagRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check WebGL2 support on mount
  useEffect(() => {
    setWebglSupported(checkWebGL2Support());
  }, []);

  // Determine which renderer to use
  const useWebGL = (() => {
    if (webglSupported === null) return false; // Still checking
    if (performanceSettings.renderer === "canvas") return false;
    if (performanceSettings.renderer === "webgl") return webglSupported;
    // "auto" mode - use WebGL if supported
    return webglSupported;
  })();

  // Apply mobile/reduced-motion defaults when detected
  useEffect(() => {
    if (prefersReducedMotion) {
      // Reduced motion takes priority - minimal animations
      setPerformanceSettings(REDUCED_MOTION_SETTINGS);
      hasSetMobileDefaults.current = true;
    } else if (isMobile && !hasSetMobileDefaults.current) {
      hasSetMobileDefaults.current = true;
      setPerformanceSettings(MOBILE_DEFAULT_SETTINGS);
    }
  }, [isMobile, prefersReducedMotion]);

  // Load updateHash from localStorage and check rate limit on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setUpdateHash(stored);
    }

    // Check current rate limit status from server
    const checkRateLimit = async () => {
      try {
        const res = await fetch("/api/rate-limit");
        if (res.ok) {
          const data = await res.json();
          if (data.remainingSeconds > 0) {
            setRateLimitSeconds(data.remainingSeconds);
          }
        }
      } catch (error) {
        console.error("Error checking rate limit:", error);
      } finally {
        setRateLimitChecked(true);
      }
    };
    checkRateLimit();
  }, []);

  // Countdown timer for rate limit
  useEffect(() => {
    if (rateLimitSeconds > 0) {
      rateLimitTimerRef.current = setInterval(() => {
        setRateLimitSeconds((prev) => {
          if (prev <= 1) {
            if (rateLimitTimerRef.current) {
              clearInterval(rateLimitTimerRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (rateLimitTimerRef.current) {
          clearInterval(rateLimitTimerRef.current);
        }
      };
    }
  }, [rateLimitSeconds]);

  // Keep UI visible longer when rate limit message appears (so user can read it)
  useEffect(() => {
    if (rateLimitSeconds > 0 && !uiPinned) {
      // Clear any existing idle timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      // Keep UI visible, then start longer timeout
      setUiVisible(true);
      idleTimerRef.current = setTimeout(() => {
        setUiVisible(false);
      }, POST_ACTION_TIMEOUT);
    }
  }, [rateLimitSeconds > 0, uiPinned]); // Only trigger when transitioning to rate limited state

  // Track user activity (mouse and touch)
  useEffect(() => {
    // If UI is pinned, always show and don't set up idle timers
    if (uiPinned) {
      setUiVisible(true);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

    const timeout = isMobile ? MOBILE_IDLE_TIMEOUT : IDLE_TIMEOUT;

    const handleActivity = () => {
      setUiVisible(true);

      // Clear existing timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      // Start new timer (only if settings is not open)
      if (!settingsOpen) {
        idleTimerRef.current = setTimeout(() => {
          setUiVisible(false);
        }, timeout);
      }
    };

    // Start initial timer (only if settings is not open)
    if (!settingsOpen) {
      idleTimerRef.current = setTimeout(() => {
        setUiVisible(false);
      }, timeout);
    }

    // Mouse events (passive for better scroll performance)
    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("mousedown", handleActivity, { passive: true });
    // Touch events for mobile (passive for better scroll performance)
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("touchmove", handleActivity, { passive: true });

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("touchmove", handleActivity);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [isMobile, settingsOpen, uiPinned]);

  // Fetch feelings from server with ETag support
  const fetchFeelings = useCallback(async () => {
    try {
      const headers: HeadersInit = {};
      if (etagRef.current) {
        headers["If-None-Match"] = etagRef.current;
      }

      const res = await fetch("/api/feelings", { headers });

      // 304 Not Modified - data hasn't changed
      if (res.status === 304) {
        return;
      }

      if (res.ok) {
        // Store ETag for next request
        const newEtag = res.headers.get("ETag");
        if (newEtag) {
          etagRef.current = newEtag;
        }

        const data = await res.json();
        setFeelings(data.feelings);
      }
    } catch (error) {
      console.error("Error fetching feelings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Poll for new feelings with visibility-aware interval
  useEffect(() => {
    fetchFeelings();

    const startPolling = (interval: number) => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      pollIntervalRef.current = setInterval(fetchFeelings, interval);
    };

    // Start with active interval
    startPolling(POLL_INTERVAL);

    // Adjust polling based on tab visibility
    const handleVisibilityChange = () => {
      if (document.hidden) {
        startPolling(POLL_INTERVAL_HIDDEN);
      } else {
        // Tab became visible - fetch immediately and resume normal polling
        fetchFeelings();
        startPolling(POLL_INTERVAL);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchFeelings]);

  // Handle emotion selection
  const handleEmotionSelect = async (emotion: Emotion) => {
    setIsSubmitting(true);
    try {
      // If user has an existing feeling, update it; otherwise create new
      const isUpdate = updateHash !== null;
      const res = await fetch("/api/feelings", {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isUpdate
            ? { updateHash, emotionId: emotion.id }
            : { emotionId: emotion.id }
        ),
      });

      if (res.ok) {
        const data = await res.json();
        if (isUpdate) {
          // Replace the updated feeling in the list
          setFeelings((prev) =>
            prev.map((f) =>
              f.id === data.feeling.id ? data.feeling : f
            )
          );
        } else {
          // New feeling - save the updateHash and add to list
          const newHash = data.feeling.updateHash;
          if (newHash) {
            localStorage.setItem(STORAGE_KEY, newHash);
            setUpdateHash(newHash);
          }
          setFeelings((prev) => [...prev, data.feeling]);
        }
        // Set rate limit countdown from successful response
        if (data.remainingSeconds) {
          setRateLimitSeconds(data.remainingSeconds);
        }
      } else if (res.status === 429) {
        const data = await res.json();
        setRateLimitSeconds(data.remainingSeconds || 0);
      }
    } catch (error) {
      console.error("Error saving feeling:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="relative w-full h-screen overflow-hidden bg-[#0a0a12]">
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white/30 text-sm font-light animate-pulse">...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative w-full h-screen overflow-hidden bg-[#0a0a12]">
      {useWebGL ? (
        <WebGLRibbonRenderer
          feelings={feelings}
          maxVisibleRibbons={performanceSettings.maxVisibleRibbons}
          isMobile={isMobile}
          reducedMotion={prefersReducedMotion}
        />
      ) : (
        <P5Canvas
          feelings={feelings}
          settings={performanceSettings}
          isMobile={isMobile}
          reducedMotion={prefersReducedMotion}
        />
      )}
      <AmbientInfo feelingsCount={feelings.length} visible={uiVisible || uiPinned} />
      <Settings
        settings={performanceSettings}
        onSettingsChange={setPerformanceSettings}
        feelingsCount={feelings.length}
        visible={uiVisible || settingsOpen || uiPinned}
        onOpenChange={setSettingsOpen}
        uiPinned={uiPinned}
        onUiPinnedChange={setUiPinned}
        onInfoOpen={() => setInfoOpen(true)}
      />
      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} />
      <EmotionPicker
        onSelect={handleEmotionSelect}
        disabled={isSubmitting}
        visible={(uiVisible || uiPinned) && rateLimitChecked}
        rateLimitSeconds={rateLimitSeconds}
      />
    </main>
  );
}
