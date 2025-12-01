"use client";

import { useState, useMemo, useCallback } from "react";
import type {
  TokenContributionData,
  DailyContribution,
  ViewMode,
  ThemeName,
  SourceType,
  TooltipPosition,
} from "@/lib/types";
import { getTheme, DEFAULT_THEME } from "@/lib/themes";
import { filterBySource, filterByYear, recalculateIntensity } from "@/lib/utils";
import { TokenGraph2D } from "./TokenGraph2D";
import { TokenGraph3D } from "./TokenGraph3D";
import { GraphControls } from "./GraphControls";
import { Tooltip } from "./Tooltip";
import { BreakdownPanel } from "./BreakdownPanel";
import { StatsPanel } from "./StatsPanel";

interface GraphContainerProps {
  data: TokenContributionData;
}

export function GraphContainer({ data }: GraphContainerProps) {
  // State
  const [view, setView] = useState<ViewMode>("2d");
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    // Default to most recent year
    return data.years.length > 0 ? data.years[data.years.length - 1].year : "";
  });
  const [hoveredDay, setHoveredDay] = useState<DailyContribution | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const [selectedDay, setSelectedDay] = useState<DailyContribution | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceType[]>([]);

  // Get theme
  const theme = useMemo(() => getTheme(themeName), [themeName]);

  // Get available years
  const availableYears = useMemo(() => data.years.map((y) => y.year), [data.years]);

  // Get available sources
  const availableSources = useMemo(() => data.summary.sources, [data.summary.sources]);

  // Filter data by source
  const filteredBySource = useMemo(() => {
    if (sourceFilter.length === 0) return data;
    return filterBySource(data, sourceFilter);
  }, [data, sourceFilter]);

  // Filter contributions by year
  const yearContributions = useMemo(() => {
    const filtered = filterByYear(filteredBySource.contributions, selectedYear);
    return recalculateIntensity(filtered);
  }, [filteredBySource.contributions, selectedYear]);

  // Calculate max cost for 3D scaling
  const maxCost = useMemo(() => {
    return Math.max(...yearContributions.map((c) => c.totals.cost), 0);
  }, [yearContributions]);

  // Handlers
  const handleDayHover = useCallback(
    (day: DailyContribution | null, position: TooltipPosition | null) => {
      setHoveredDay(day);
      setTooltipPosition(position);
    },
    []
  );

  const handleDayClick = useCallback((day: DailyContribution | null) => {
    setSelectedDay((prev) => (prev?.date === day?.date ? null : day));
  }, []);

  const handleCloseBreakdown = useCallback(() => {
    setSelectedDay(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <GraphControls
        view={view}
        onViewChange={setView}
        themeName={themeName}
        onThemeChange={setThemeName}
        selectedYear={selectedYear}
        availableYears={availableYears}
        onYearChange={setSelectedYear}
        sourceFilter={sourceFilter}
        availableSources={availableSources}
        onSourceFilterChange={setSourceFilter}
        theme={theme}
      />

      {/* Graph */}
      <div
        className="rounded-lg border p-4 overflow-hidden"
        style={{
          backgroundColor: theme.background,
          borderColor: theme.meta,
        }}
      >
        {view === "2d" ? (
          <TokenGraph2D
            contributions={yearContributions}
            theme={theme}
            year={selectedYear}
            onDayHover={handleDayHover}
            onDayClick={handleDayClick}
          />
        ) : (
          <TokenGraph3D
            contributions={yearContributions}
            theme={theme}
            year={selectedYear}
            maxCost={maxCost}
            onDayHover={handleDayHover}
            onDayClick={handleDayClick}
          />
        )}
      </div>

      {/* Breakdown Panel (shown when day is selected) */}
      {selectedDay && (
        <BreakdownPanel
          day={selectedDay}
          onClose={handleCloseBreakdown}
          theme={theme}
        />
      )}

      {/* Stats Panel */}
      <StatsPanel data={filteredBySource} theme={theme} />

      {/* Tooltip (floating) */}
      <Tooltip
        day={hoveredDay}
        position={tooltipPosition}
        visible={hoveredDay !== null}
        theme={theme}
      />
    </div>
  );
}
