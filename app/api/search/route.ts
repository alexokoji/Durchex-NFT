import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limit = req.nextUrl.searchParams.get("limit")
    ? Number(req.nextUrl.searchParams.get("limit"))
    : 8;
  const results = await search(q, limit);
  return NextResponse.json(results);
}
