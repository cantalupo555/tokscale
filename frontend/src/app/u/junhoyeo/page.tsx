"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Navigation } from "@/components/layout/Navigation";
import { Footer } from "@/components/layout/Footer";
import { ProfileSkeleton } from "@/components/Skeleton";
import {
  ProfileHeader,
  ProfileTabBar,
  TokenBreakdown,
  ProfileModels,
  ProfileActivity,
  MockupBadge,
  ProfileCTA,
  type ProfileUser,
  type ProfileStatsData,
  type ProfileTab,
} from "@/components/profile";
import type { TokenContributionData } from "@/lib/types";

const MOCK_USER: ProfileUser = {
  username: "junhoyeo",
  displayName: "Junho Yeo",
  avatarUrl: "https://avatars.githubusercontent.com/u/32605822?v=4",
  rank: 1,
};

export default function JunhoyeoMockupPage() {
  const [data, setData] = useState<TokenContributionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>("activity");

  useEffect(() => {
    fetch("/junhoyeo-data.json")
      .then((res) => res.json())
      .then((result) => {
        setData(result);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  const stats: ProfileStatsData | null = useMemo(() => {
    if (!data) return null;

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;

    for (const day of data.contributions) {
      inputTokens += day.tokenBreakdown.input;
      outputTokens += day.tokenBreakdown.output;
      cacheReadTokens += day.tokenBreakdown.cacheRead;
      cacheWriteTokens += day.tokenBreakdown.cacheWrite;
    }

    return {
      totalTokens: data.summary.totalTokens,
      totalCost: data.summary.totalCost,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      activeDays: data.summary.activeDays,
      submissionCount: 1,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#141415" }}>
        <Navigation />
        <main className="flex-1 max-w-[800px] mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full">
          <ProfileSkeleton />
        </main>
        <Footer />
      </div>
    );
  }

  if (!data || !stats) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#141415" }}>
        <Navigation />
        <main className="flex-1 max-w-[800px] mx-auto px-6 py-10 w-full">
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold text-white mb-2">
              Failed to load data
            </h1>
            <p className="mb-6" style={{ color: "#696969" }}>
              Make sure junhoyeo-data.json exists in the public folder.
            </p>
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#141415" }}>
      <Navigation />

      <main className="flex-1 max-w-[800px] mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full">
        <div className="flex flex-col gap-8">
          <MockupBadge />

          <ProfileHeader
            user={MOCK_USER}
            stats={stats}
            lastUpdated={data.meta.dateRange.end}
          />

          <ProfileTabBar activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === "activity" && <ProfileActivity data={data} />}
          {activeTab === "breakdown" && <TokenBreakdown stats={stats} />}
          {activeTab === "models" && <ProfileModels models={data.summary.models} />}

          <ProfileCTA />
        </div>
      </main>

      <Footer />
    </div>
  );
}
