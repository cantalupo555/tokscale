import { Navigation } from "@/components/layout/Navigation";
import { Footer } from "@/components/layout/Footer";
import { BlackholeHero } from "@/components/BlackholeHero";
import { getLeaderboardData } from "@/lib/leaderboard/getLeaderboard";
import LeaderboardClient from "./LeaderboardClient";

export const revalidate = 60;

export default async function LeaderboardPage() {
  const initialData = await getLeaderboardData("all", 1, 50);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--color-bg-default)",
      }}
    >
      <Navigation />

      <main className="main-container">
        <BlackholeHero />
        <LeaderboardClient initialData={initialData} />
      </main>

      <Footer />
    </div>
  );
}
