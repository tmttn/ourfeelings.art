"use client";

import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

// Check if device has touch capability (catches tablets too)
function hasTouchSupport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - msMaxTouchPoints is IE-specific
    navigator.msMaxTouchPoints > 0
  );
}

// Check if device is likely a mobile/tablet based on user agent
function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isSmallScreen = window.innerWidth < MOBILE_BREAKPOINT;
      const isTouch = hasTouchSupport();
      const isMobileUA = isMobileUserAgent();

      // Consider mobile if: small screen, OR (touch device AND mobile user agent)
      // This catches phones, tablets, but excludes touch-enabled laptops
      setIsMobile(isSmallScreen || (isTouch && isMobileUA));
    };

    // Check on mount
    checkMobile();

    // Listen for resize (passive for better performance)
    window.addEventListener("resize", checkMobile, { passive: true });
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

// Hook to check if user prefers reduced motion
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return prefersReducedMotion;
}
