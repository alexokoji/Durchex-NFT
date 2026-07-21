import { NextRequest, NextResponse } from "next/server";
import { getExploreItems, ExploreFilters } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const traitsRaw = sp.get("traits");
  let traits: ExploreFilters["traits"];
  if (traitsRaw) {
    try {
      traits = JSON.parse(traitsRaw);
    } catch {
      traits = undefined;
    }
  }

  const filters: ExploreFilters = {
    category: sp.get("category") ?? undefined,
    collectionSlug: sp.get("collection") ?? undefined,
    status: (sp.get("status") as ExploreFilters["status"]) ?? undefined,
    sort: (sp.get("sort") as ExploreFilters["sort"]) ?? undefined,
    minPrice: sp.get("minPrice") ? Number(sp.get("minPrice")) : undefined,
    maxPrice: sp.get("maxPrice") ? Number(sp.get("maxPrice")) : undefined,
    traits,
    page: sp.get("page") ? Number(sp.get("page")) : 1,
    pageSize: 24,
  };

  const result = await getExploreItems(filters);
  return NextResponse.json(result);
}
