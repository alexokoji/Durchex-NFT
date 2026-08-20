import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { ItemBalance } from "@/lib/models/ItemBalance";
import { Bid } from "@/lib/models/Bid";
import { getCurrentUser } from "@/lib/auth/currentUser";

/**
 * Prepares an owner's acceptance of an NFT offer.
 *
 * This used to just flip status to "accepted" and notify the bidder —
 * nothing moved, so "accepting" an offer was purely cosmetic. Settlement
 * now goes through DurchexOffers, treating an NFT offer as a collection
 * offer whose eligible set contains exactly one token. That means the
 * merkle root is the leaf itself and the proof is empty.
 *
 * Nothing here transfers anything: this returns the payload the seller's
 * wallet submits. The status only advances once the on-chain fill is
 * confirmed, so a half-finished acceptance can't leave the offer looking
 * consumed when it isn't.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in to accept an offer" }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  const bid = await Bid.findById(id);
  if (!bid || bid.type !== "offer" || bid.status !== "active") {
    return NextResponse.json({ error: "This offer is no longer available" }, { status: 404 });
  }
  if (bid.expiresAt && bid.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "This offer has expired" }, { status: 409 });
  }
  // Offers created before on-chain settlement existed carry no signature
  // and can never be filled. Say so plainly instead of failing obscurely
  // in the user's wallet.
  // An escrowed offer needs nothing but its id — the funds are already
  // in the contract, so there is no signature to validate.
  if (!bid.escrowOfferId && (!bid.signature || !bid.nonce || !bid.criteriaRoot || !bid.nft)) {
    return NextResponse.json(
      {
        error:
          "This offer predates on-chain settlement and can't be accepted. Ask the buyer to withdraw it and make a new one.",
      },
      { status: 409 }
    );
  }

  const item = await Item.findById(bid.item);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (!item.isMinted || !item.tokenId) {
    return NextResponse.json({ error: "This NFT hasn't been minted yet" }, { status: 400 });
  }
  if (String(bid.buyerAddress).toLowerCase() === user.address.toLowerCase()) {
    return NextResponse.json({ error: "You can't accept your own offer" }, { status: 400 });
  }

  // Ownership differs by standard: 721 has one owner, 1155 is a balance.
  if (item.standard === "ERC1155") {
    const balance = await ItemBalance.findOne({ item: item._id, owner: user._id });
    if (!balance || balance.quantity < 1) {
      return NextResponse.json({ error: "You don't hold any units of this NFT" }, { status: 403 });
    }
  } else if (String(item.owner) !== String(user._id)) {
    return NextResponse.json({ error: "Only the current owner can accept this offer" }, { status: 403 });
  }

  return NextResponse.json({
    // Present on escrowed ETH offers; the client settles through
    // DurchexOffersEscrow when it is, and the legacy WETH path when not.
    escrowOfferId: bid.escrowOfferId ?? null,
    // Single-token eligible set: root is the leaf, so no proof is needed.
    proof: [],
    tokenId: String(item.tokenId),
    offer: {
      nft: bid.nft,
      isERC1155: item.standard === "ERC1155",
      criteriaRoot: bid.criteriaRoot,
      pricePerItem: String(Math.round(bid.amountEth * 1e18)),
      quantity: "1",
      deadline: String(bid.deadline ? Math.floor(bid.deadline.getTime() / 1000) : 0),
      nonce: bid.nonce,
      buyer: bid.buyerAddress,
    },
    signature: bid.signature,
    chainId: bid.chainId,
  });
}
