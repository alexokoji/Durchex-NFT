import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { CollectionMeta } from "@/components/collection/CollectionMeta";
import { CollectionDetailView } from "@/lib/types";
import { DropMintPanel } from "@/components/drop/DropMintPanel";
import { PhaseManager } from "@/components/collection/PhaseManager";
import { ListingControl } from "@/components/collection/ListingControl";
import { ContractAttach } from "@/components/collection/ContractAttach";
import { BuyFloorButton } from "@/components/collection/BuyFloorButton";
import { MakeCollectionOfferButton } from "@/components/collection/MakeCollectionOfferButton";
import { CollectionOffersList } from "@/components/collection/CollectionOffersList";
import { isCollectionSoldOut } from "@/lib/mintPhases";

export function CollectionHeader({ collection }: { collection: CollectionDetailView }) {
  // While a capped collection still has supply left to mint, the primary
  // path is the mint panel below, not the secondary market — Buy Floor and
  // Make Offer only make sense once there's nothing left to mint and the
  // only way in is buying from an existing holder. Uncapped collections
  // (maxSupply 0) never reach "sold out", so this never hides them there.
  const secondaryMarketReady = collection.maxSupply === 0 || isCollectionSoldOut(collection);

  return (
    <div>
      <div className="relative h-48 sm:h-64 overflow-hidden rounded-2xl">
        {collection.bannerUrl ? <img src={collection.bannerUrl} alt={`${collection.name} cover`} className="w-full h-full object-cover" /> : <GeneratedArt seedKey={`banner-${collection.slug}`} className="w-full h-full" />}
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent" />
      </div>

      <div className="-mt-12 relative">
        <CollectionMeta
          collection={collection}
          logo={
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-4 border-void shadow-xl shrink-0">
              {collection.logoUrl ? <img src={collection.logoUrl} alt={`${collection.name} logo`} className="w-full h-full object-cover" /> : <GeneratedArt seedKey={`logo-${collection.slug}`} className="w-full h-full" />}
            </div>
          }
        />
      </div>

      {secondaryMarketReady && (
        <div className="mt-6 px-4 sm:px-8 flex flex-wrap gap-2">
          <BuyFloorButton collection={collection} />
          <MakeCollectionOfferButton collection={collection} />
        </div>
      )}
      {collection.contractType === "drop" && (
        <div className="px-4 sm:px-8">
          <DropMintPanel drop={{ collectionId: collection.id, contractAddress: collection.contractAddress, chainId: collection.chainId, phases: collection.mintPhases }} />
        </div>
      )}
      <div className="px-4 sm:px-8">
        <ContractAttach
          collectionId={collection.id}
          creatorAddress={collection.creatorAddress}
          contractAddress={collection.contractAddress}
          chainId={collection.chainId}
        />
        <PhaseManager collectionId={collection.id} creatorAddress={collection.creatorAddress} />
        <ListingControl collectionId={collection.id} creatorAddress={collection.creatorAddress} />
        <CollectionOffersList collection={collection} />
      </div>
    </div>
  );
}
