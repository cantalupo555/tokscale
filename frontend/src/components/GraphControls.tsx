"use client";

import type { ViewMode, ThemeName, SourceType, Theme } from "@/lib/types";
import { getThemeNames, themes } from "@/lib/themes";
import { SOURCE_DISPLAY_NAMES } from "@/lib/constants";

interface GraphControlsProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  themeName: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  selectedYear: string;
  availableYears: string[];
  onYearChange: (year: string) => void;
  sourceFilter: SourceType[];
  availableSources: SourceType[];
  onSourceFilterChange: (sources: SourceType[]) => void;
  theme: Theme;
}

export function GraphControls({
  view,
  onViewChange,
  themeName,
  onThemeChange,
  selectedYear,
  availableYears,
  onYearChange,
  sourceFilter,
  availableSources,
  onSourceFilterChange,
  theme,
}: GraphControlsProps) {
  const themeNames = getThemeNames();

  const handleSourceToggle = (source: SourceType) => {
    if (sourceFilter.includes(source)) {
      // Remove source
      const newFilter = sourceFilter.filter((s) => s !== source);
      onSourceFilterChange(newFilter);
    } else {
      // Add source
      onSourceFilterChange([...sourceFilter, source]);
    }
  };

  const handleSelectAllSources = () => {
    onSourceFilterChange([...availableSources]);
  };

  const handleClearSources = () => {
    onSourceFilterChange([]);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-4 p-4 rounded-lg border"
      style={{
        backgroundColor: theme.background,
        borderColor: theme.meta,
      }}
    >
      {/* View Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide" style={{ color: theme.meta }}>
          View
        </span>
        <div
          className="flex rounded overflow-hidden border"
          style={{ borderColor: theme.meta }}
        >
          <button
            onClick={() => onViewChange("2d")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "2d" ? "text-white" : ""
            }`}
            style={{
              backgroundColor: view === "2d" ? theme.grade3 : "transparent",
              color: view === "2d" ? "#fff" : theme.text,
            }}
          >
            2D
          </button>
          <button
            onClick={() => onViewChange("3d")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "3d" ? "text-white" : ""
            }`}
            style={{
              backgroundColor: view === "3d" ? theme.grade3 : "transparent",
              color: view === "3d" ? "#fff" : theme.text,
            }}
          >
            3D
          </button>
        </div>
      </div>

      {/* Theme Selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide" style={{ color: theme.meta }}>
          Theme
        </span>
        <select
          value={themeName}
          onChange={(e) => onThemeChange(e.target.value as ThemeName)}
          className="px-2 py-1.5 text-sm rounded border bg-transparent"
          style={{
            borderColor: theme.meta,
            color: theme.text,
          }}
        >
          {themeNames.map((name) => (
            <option key={name} value={name} style={{ backgroundColor: themes[name].background }}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Year Selector */}
      {availableYears.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide" style={{ color: theme.meta }}>
            Year
          </span>
          <select
            value={selectedYear}
            onChange={(e) => onYearChange(e.target.value)}
            className="px-2 py-1.5 text-sm rounded border bg-transparent"
            style={{
              borderColor: theme.meta,
              color: theme.text,
            }}
          >
            {availableYears.map((year) => (
              <option key={year} value={year} style={{ backgroundColor: theme.background }}>
                {year}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Source Filter */}
      {availableSources.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wide" style={{ color: theme.meta }}>
            Sources
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {availableSources.map((source) => {
              const isSelected = sourceFilter.length === 0 || sourceFilter.includes(source);
              return (
                <button
                  key={source}
                  onClick={() => handleSourceToggle(source)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    isSelected ? "font-medium" : "opacity-50"
                  }`}
                  style={{
                    backgroundColor: isSelected ? `${theme.grade3}30` : "transparent",
                    color: theme.text,
                    border: `1px solid ${isSelected ? theme.grade3 : theme.meta}`,
                  }}
                >
                  {SOURCE_DISPLAY_NAMES[source] || source}
                </button>
              );
            })}
            {sourceFilter.length > 0 && sourceFilter.length < availableSources.length && (
              <button
                onClick={handleSelectAllSources}
                className="px-2 py-1 text-xs rounded transition-colors"
                style={{
                  color: theme.meta,
                  textDecoration: "underline",
                }}
              >
                All
              </button>
            )}
            {sourceFilter.length === availableSources.length && (
              <button
                onClick={handleClearSources}
                className="px-2 py-1 text-xs rounded transition-colors"
                style={{
                  color: theme.meta,
                  textDecoration: "underline",
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-xs" style={{ color: theme.meta }}>
          Less
        </span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor: theme[`grade${level}` as keyof Theme] as string,
            }}
          />
        ))}
        <span className="text-xs" style={{ color: theme.meta }}>
          More
        </span>
      </div>
    </div>
  );
}
