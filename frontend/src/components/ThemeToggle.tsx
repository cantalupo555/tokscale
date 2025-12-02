"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "@/lib/useSettings";

/**
 * Size constants for consistent styling
 */
const SIZES = {
  /** Width of each button */
  buttonWidth: 32,
  /** Height of each button */
  buttonHeight: 24,
  /** Width of the sliding indicator (slightly smaller than button) */
  indicatorWidth: 28,
  /** Padding inside the container */
  containerPadding: 4,
  /** Gap between buttons */
  buttonGap: 2,
  /** Icon size */
  iconSize: 14,
} as const;

/** Calculate total container width: 3 buttons + gaps + padding */
const CONTAINER_WIDTH =
  SIZES.buttonWidth * 3 +
  SIZES.buttonGap * 2 +
  SIZES.containerPadding * 2;

/** Calculate container height: button height + padding */
const CONTAINER_HEIGHT = SIZES.buttonHeight + SIZES.containerPadding * 2;

/**
 * Theme options configuration
 */
const themes = [
  { value: "light" as const, label: "Light theme", icon: Sun },
  { value: "dark" as const, label: "Dark theme", icon: Moon },
  { value: "system" as const, label: "System theme", icon: Monitor },
] as const;

interface ThemeToggleProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  mounted: boolean;
}

/**
 * Hyper-realistic 3-state theme toggle with premium sliding indicator.
 * Supports Light / Dark / System modes with smooth spring animations.
 */
export function ThemeToggle({ theme, onThemeChange, mounted }: ThemeToggleProps) {
  const activeIndex = themes.findIndex((t) => t.value === theme);

  // Calculate indicator position based on active index
  const indicatorX =
    activeIndex * (SIZES.buttonWidth + SIZES.buttonGap) +
    SIZES.containerPadding +
    (SIZES.buttonWidth - SIZES.indicatorWidth) / 2;

  // Skeleton loader for SSR hydration
  if (!mounted) {
    return (
      <div
        className="animate-pulse rounded-full"
        style={{
          width: CONTAINER_WIDTH,
          height: CONTAINER_HEIGHT,
          background: "linear-gradient(to bottom, var(--color-btn-bg), var(--color-canvas-subtle))",
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme selection"
      className="relative inline-flex items-center rounded-full"
      style={{
        width: CONTAINER_WIDTH,
        height: CONTAINER_HEIGHT,
        padding: SIZES.containerPadding,
        gap: SIZES.buttonGap,
        background: "linear-gradient(to bottom, var(--color-btn-bg), var(--color-canvas-subtle))",
        boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.05), 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        border: "1px solid var(--color-border-subtle)",
      }}
    >
      {/* Animated sliding indicator */}
      <motion.div
        className="absolute rounded-full"
        style={{
          top: SIZES.containerPadding,
          bottom: SIZES.containerPadding,
          width: SIZES.indicatorWidth,
          backgroundColor: "var(--color-card-bg)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px var(--color-border-subtle)",
        }}
        initial={false}
        animate={{ x: indicatorX }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      />

      {themes.map(({ value, label, icon: Icon }) => {
        const isActive = theme === value;

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onThemeChange(value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                const nextIndex = (activeIndex + 1) % themes.length;
                onThemeChange(themes[nextIndex].value);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                const prevIndex = (activeIndex - 1 + themes.length) % themes.length;
                onThemeChange(themes[prevIndex].value);
              }
            }}
            className="relative z-10 flex items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            style={{
              width: SIZES.buttonWidth,
              height: SIZES.buttonHeight,
              color: isActive ? "var(--color-fg-default)" : "var(--color-fg-muted)",
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={`${value}-${isActive}`}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Icon
                  size={SIZES.iconSize}
                  strokeWidth={isActive ? 2.5 : 2}
                  className="transition-all duration-200"
                  style={{
                    filter: isActive ? "drop-shadow(0 1px 1px rgba(0,0,0,0.1))" : "none",
                  }}
                />
              </motion.div>
            </AnimatePresence>
          </button>
        );
      })}
    </div>
  );
}
