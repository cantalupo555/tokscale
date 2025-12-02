"use client";

import { useSyncExternalStore } from "react";

/**
 * Subscribe to a media query using React 18's useSyncExternalStore.
 * This avoids the setState-in-effect anti-pattern.
 *
 * @param query - Media query string (e.g., "(prefers-color-scheme: dark)")
 * @returns Whether the media query matches
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    // Subscribe function
    (callback) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", callback);
      return () => mq.removeEventListener("change", callback);
    },
    // Get client snapshot
    () => window.matchMedia(query).matches,
    // Get server snapshot (SSR fallback)
    () => false
  );
}

/**
 * Hook to detect system dark mode preference.
 * Uses useSyncExternalStore for proper React 18 subscription.
 */
export function useSystemDarkMode(): boolean {
  return useMediaQuery("(prefers-color-scheme: dark)");
}
