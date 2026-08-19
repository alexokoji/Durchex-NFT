import { Types } from "mongoose";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { ItemBalance } from "@/lib/models/ItemBalance";
import { Bid } from "@/lib/models/Bid";
import { Favorite } from "@/lib/models/Favorite";
import { Activity } from "@/lib/models/Activity";
import { Notification } from "@/lib/models/Notification";
import { Listing } from "@/lib/models/Listing";
import { CollectionOffer } from "@/lib/models/CollectionOffer";
import { PhaseClaim } from "@/lib/models/PhaseClaim";
import { DropNotify } from "@/lib/models/DropNotify";

export type DeleteResult =
  | { ok: true; slug: string; items: number }
  | { ok: false; status: number; error: string; mintedSupply?: number };

/**
 * Removes a collection and everything hanging off it.
 *
 * Refused once anything has been minted on-chain: those tokens exist
 * independently of us and belong to their holders, so deleting our record
 * would leave real owners pointing at a collection that no longer resolves
 * and metadata URIs that 404. Hiding it is the reversible alternative, and
 * the one the admin panel offers in that case.
 */
export async function deleteCollectionCascade(id: string | Types.ObjectId): Promise<DeleteResult> {
  const collection = await Collection.findById(id);
  if (!collection) return { ok: false, status: 404, error: "Collection not found" };

  const mintedSupply = await Item.countDocuments({ collection: collection._id, isMinted: true });
  if (mintedSupply > 0) {
    return {
      ok: false,
      status: 409,
      mintedSupply,
      error:
        mintedSupply === 1
          ? "1 item has already been minted on-chain, so this collection can't be deleted. Hide it instead."
          : `${mintedSupply} items have already been minted on-chain, so this collection can't be deleted. Hide it instead.`,
    };
  }

  const itemIds = (await Item.find({ collection: collection._id }).select("_id").lean()).map((i) => i._id);

  await Promise.all([
    Item.deleteMany({ collection: collection._id }),
    ItemBalance.deleteMany({ item: { $in: itemIds } }),
    Bid.deleteMany({ item: { $in: itemIds } }),
    Favorite.deleteMany({ item: { $in: itemIds } }),
    Activity.deleteMany({ item: { $in: itemIds } }),
    Notification.deleteMany({ item: { $in: itemIds } }),
    Listing.deleteMany({ collection: collection._id }),
    CollectionOffer.deleteMany({ collection: collection._id }),
    PhaseClaim.deleteMany({ collection: collection._id }),
    DropNotify.deleteMany({ collection: collection._id }),
  ]);
  await Collection.deleteOne({ _id: collection._id });

  return { ok: true, slug: collection.slug, items: itemIds.length };
}
