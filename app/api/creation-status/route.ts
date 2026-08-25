import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { checkCreationAllowed } from "@/lib/creationGate";
import { chainsAvailableForCreation } from "@/lib/web3/deployedContract";

export const dynamic = "force-dynamic";

// Which chains the form may offer. Sent from the server because it is
// derived from what is actually deployed, and the client has no way to
// know that — a hardcoded list in the UI is exactly how a creator ends up
// launching onto a chain with no contracts.
const chains = () => ({
  ERC721: chainsAvailableForCreation("ERC721"),
  ERC1155: chainsAvailableForCreation("ERC1155"),
});

// Lets the create flow say up front that creation is closed, instead of
// letting someone fill in four steps and sign a voucher only to be
// refused by POST /api/collections. The API check remains the real gate.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ open: true, chains: chains() });
  await connectDB();
  const gate = await checkCreationAllowed(user.address);
  return NextResponse.json(
    gate.allowed
      ? { open: true, chains: chains() }
      : { open: false, reason: gate.error, chains: chains() }
  );
}
