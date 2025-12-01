"use client";

import type { TokenContributionData, Theme } from "@/lib/types";
import {
  formatCurrency,
  formatTokenCount,
  formatDate,
  calculateCurrentStreak,
  calculateLongestStreak,
  findBestDay,
} from "@/lib/utils";

interface StatsPanelProps {
  data: TokenContributionData;
  theme: Theme;
}

export function StatsPanel({ data, theme }: StatsPanelProps) {
  const { summary, contributions } = data;

  const currentStreak = calculateCurrentStreak(contributions);
  const longestStreak = calculateLongestStreak(contributions);
  const bestDay = findBestDay(contributions);

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: theme.background,
        borderColor: theme.meta,
      }}
    >
      <h3
        className="text-sm font-semibold mb-3 uppercase tracking-wide"
        style={{ color: theme.meta }}
      >
        Statistics
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {/* Total Cost */}
        <StatItem
          label="Total Cost"
          value={formatCurrency(summary.totalCost)}
          theme={theme}
          highlight
        />

        {/* Total Tokens */}
        <StatItem
          label="Total Tokens"
          value={formatTokenCount(summary.totalTokens)}
          theme={theme}
        />

        {/* Active Days */}
        <StatItem
          label="Active Days"
          value={`${summary.activeDays} / ${summary.totalDays}`}
          theme={theme}
        />

        {/* Avg Per Day */}
        <StatItem
          label="Avg / Day"
          value={formatCurrency(summary.averagePerDay)}
          theme={theme}
        />

        {/* Current Streak */}
        <StatItem
          label="Current Streak"
          value={`${currentStreak} day${currentStreak !== 1 ? "s" : ""}`}
          theme={theme}
        />

        {/* Longest Streak */}
        <StatItem
          label="Longest Streak"
          value={`${longestStreak} day${longestStreak !== 1 ? "s" : ""}`}
          theme={theme}
        />

        {/* Best Day */}
        {bestDay && bestDay.totals.cost > 0 && (
          <StatItem
            label="Best Day"
            value={formatDate(bestDay.date)}
            subValue={formatCurrency(bestDay.totals.cost)}
            theme={theme}
          />
        )}

        {/* Models Used */}
        <StatItem
          label="Models"
          value={summary.models.length.toString()}
          theme={theme}
        />
      </div>

      {/* Sources */}
      <div
        className="mt-4 pt-4 border-t flex flex-wrap gap-2"
        style={{ borderColor: theme.meta }}
      >
        <span className="text-xs uppercase tracking-wide mr-2" style={{ color: theme.meta }}>
          Sources:
        </span>
        {summary.sources.map((source) => (
          <span
            key={source}
            className="text-xs px-2 py-0.5 rounded"
            style={{
              backgroundColor: `${theme.grade3}20`,
              color: theme.text,
            }}
          >
            {source}
          </span>
        ))}
      </div>
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: string;
  subValue?: string;
  theme: Theme;
  highlight?: boolean;
}

function StatItem({ label, value, subValue, theme, highlight }: StatItemProps) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: theme.meta }}>
        {label}
      </div>
      <div
        className={`font-semibold ${highlight ? "text-lg" : "text-base"}`}
        style={{ color: highlight ? theme.grade4 : theme.text }}
      >
        {value}
      </div>
      {subValue && (
        <div className="text-xs" style={{ color: theme.meta }}>
          {subValue}
        </div>
      )}
    </div>
  );
}
