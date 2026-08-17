import { NextResponse } from "next/server";
import { getActiveLiveDrop } from "@/lib/queries";

export async function GET() {
  const liveDrop = await getActiveLiveDrop();
  return NextResponse.json({ liveDrop });
}
