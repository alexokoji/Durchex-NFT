import { parseEther, recoverTypedDataAddress, zeroAddress, type Address, type Hex } from "viem";
import { LISTING1155_DOMAIN_NAME, LISTING1155_DOMAIN_VERSION, LISTING1155_TYPES } from "@/lib/web3/listing1155";

/**
 * Whether a stored listing signature still authorizes the marketplace in use.
 *
 * The bookkeeping answer — compare a recorded marketplace address against
 * the current one — is only as good as the bookkeeping, and the first
 * version of it was wrong: the creation route did not select the
 * collection's chainId, so every new listing was saved against no
 * marketplace at all and read back as superseded the instant it was made.
 *
 * This asks the question directly instead. A listing is EIP-712-signed
 * over a domain that includes the marketplace as verifyingContract, so
 * recovering the signer under the *current* marketplace's domain and
 * comparing it to the seller is definitive: it is exactly the check the
 * contract itself performs before filling. No RPC, no stored field to get
 * out of step — if this returns true the contract will accept it.
 */
export type StoredListing = {
  nft?: string | null;
  tokenId?: string | null;
  quantity?: number | null;
  pricePerUnitEth?: number | null;
  buyer?: string | null;
  deadline?: Date | string | null;
  nonce?: string | null;
  signature?: string | null;
};

/** Unix seconds, as the contract reads it; 0 means no expiry. */
function deadlineSeconds(deadline: Date | string | null | undefined): bigint {
  if (!deadline) return BigInt(0);
  return BigInt(Math.floor(new Date(deadline).getTime() / 1000));
}

export async function listingAuthorizes(
  listing: StoredListing,
  sellerAddress: string,
  chainId: number,
  marketplace: string
): Promise<boolean> {
  if (!listing.signature || !listing.nonce || !listing.nft || listing.tokenId === null) return false;

  try {
    const recovered = await recoverTypedDataAddress({
      domain: {
        name: LISTING1155_DOMAIN_NAME,
        version: LISTING1155_DOMAIN_VERSION,
        chainId,
        verifyingContract: marketplace as Address,
      },
      types: LISTING1155_TYPES,
      primaryType: "Listing1155",
      message: {
        nft: listing.nft as Address,
        tokenId: BigInt(String(listing.tokenId)),
        seller: sellerAddress as Address,
        buyer: (listing.buyer ?? zeroAddress) as Address,
        quantity: BigInt(listing.quantity ?? 0),
        pricePerUnit: parseEther(String(listing.pricePerUnitEth ?? 0)),
        deadline: deadlineSeconds(listing.deadline),
        nonce: BigInt(String(listing.nonce)),
      },
      signature: listing.signature as Hex,
    });
    return recovered.toLowerCase() === sellerAddress.toLowerCase();
  } catch {
    // A malformed signature or an unparseable field is not an authorization.
    return false;
  }
}
