import { NextRequest, NextResponse } from "next/server";
import {
  getLeaderboard,
  LEADERBOARD_MINUTES,
  type LeaderboardMode,
  type LeaderboardWindow,
} from "@/lib/queries";

// Every response is a fresh count over a moving window, so there is nothing
// here worth caching — a cached "last 15 minutes" is a contradiction.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;

  const windowParam = params.get("window") ?? "1d";
  const window = (
    windowParam in LEADERBOARD_MINUTES ? windowParam : "1d"
  ) as LeaderboardWindow;
  const mode: LeaderboardMode = params.get("mode") === "trending" ? "trending" : "top";
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 10), 1), 50);

  const rows = await getLeaderboard(window, mode, limit);
  return NextResponse.json({ window, mode, rows });
}
