import { NextRequest, NextResponse } from "next/server";
import { getActivity, ActivityFilters } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const filters: ActivityFilters = {
    type: (sp.get("type") as ActivityFilters["type"]) ?? undefined,
    itemId: sp.get("item") ?? undefined,
    page: sp.get("page") ? Number(sp.get("page")) : 1,
    pageSize: 30,
  };

  const result = await getActivity(filters);
  return NextResponse.json(result);
}
