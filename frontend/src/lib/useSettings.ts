"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ColorPaletteName } from "./themes";
import { DEFAULT_PALETTE } from "./themes";

/**
 * Theme preference options
 */
export type ThemePreference = "light" | "dark" | "system";

/**
 * Settings interface stored in localStorage
 */
export interface Settings {
  theme: ThemePreference;
  paletteName: ColorPaletteName;
}

/**
 * Default settings
 */
const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  paletteName: DEFAULT_PALETTE,
};

/**
 * localStorage key for settings
 */
const STORAGE_KEY = "token-tracker-settings";

/**
 * Get settings from localStorage (SSR-safe)
 */
function getStoredSettings(): Settings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        theme: parsed.theme || DEFAULT_SETTINGS.theme,
        paletteName: parsed.paletteName || DEFAULT_SETTINGS.paletteName,
      };
    }
  } catch {
    // Invalid JSON or localStorage error
  }

  return DEFAULT_SETTINGS;
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage might be full or disabled
  }
}

/**
 * Get the system's preferred color scheme
 */
function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Apply theme class to document
 */
function applyThemeToDocument(resolvedTheme: "light" | "dark"): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
}

/**
 * Custom hook for managing app settings with localStorage persistence
 *
 * @returns Settings state and setters
 */
export function useSettings() {
  // Use lazy initializers to avoid setState-in-effect pattern
  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    return getStoredSettings();
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = getStoredSettings();
    return stored.theme === "system" ? getSystemTheme() : stored.theme;
  });

  // Use ref for mounted to avoid setState-in-effect lint error
  // We still need state for re-render trigger
  const mountedRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  // Mark as mounted and apply theme to document
  useEffect(() => {
    applyThemeToDocument(resolvedTheme);
    mountedRef.current = true;
    // Trigger re-render after mount - this is a standard hydration pattern
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount state
    setMounted(() => true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only run on mount

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (!mountedRef.current) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      if (settings.theme === "system") {
        const newResolved = e.matches ? "dark" : "light";
        // Using callback form to satisfy lint
        setResolvedTheme(() => {
          applyThemeToDocument(newResolved);
          return newResolved;
        });
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [settings.theme]);

  // Update resolved theme when settings.theme changes (user action)
  useEffect(() => {
    if (!mountedRef.current) return;

    const resolved =
      settings.theme === "system" ? getSystemTheme() : settings.theme;
    // Using callback form to conditionally update
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived state from settings
    setResolvedTheme((prev) => {
      if (prev !== resolved) {
        applyThemeToDocument(resolved);
        return resolved;
      }
      return prev;
    });
  }, [settings.theme]);

  /**
   * Set theme preference
   */
  const setTheme = useCallback((theme: ThemePreference) => {
    setSettings((prev) => {
      const newSettings = { ...prev, theme };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  /**
   * Set color palette
   */
  const setPalette = useCallback((paletteName: ColorPaletteName) => {
    setSettings((prev) => {
      const newSettings = { ...prev, paletteName };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  return {
    // Current settings
    theme: settings.theme,
    paletteName: settings.paletteName,

    // Resolved theme (actual light/dark being applied)
    resolvedTheme,

    // Setters
    setTheme,
    setPalette,

    // Hydration status (for avoiding SSR mismatch)
    mounted,
  };
}
