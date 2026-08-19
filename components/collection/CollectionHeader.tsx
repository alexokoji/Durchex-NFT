import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { CollectionMeta } from "@/components/collection/CollectionMeta";
import { CollectionDetailView } from "@/lib/types";
import { DropMintPanel } from "@/components/drop/DropMintPanel";
import { PhaseManager } from "@/components/collection/PhaseManager";
import { ContractAttach } from "@/components/collection/ContractAttach";
import { BuyFloorButton } from "@/components/collection/BuyFloorButton";
import { MakeCollectionOfferButton } from "@/components/collection/MakeCollectionOfferButton";
import { CollectionOffersList } from "@/components/collection/CollectionOffersList";
import { ResaleStatus } from "@/components/collection/ResaleStatus";
import { DeleteCollection } from "@/components/collection/DeleteCollection";

export function CollectionHeader({ collection }: { collection: CollectionDetailView }) {
  // Resale opens by itself the moment the collection is fully minted —
  // nobody toggles it. Until then the primary path is the mint panel below.
  // floorEth is derived from live, valid listings — zero means nothing is
  // actually for sale, so there is no floor to buy and the button would
  // only ever open onto an empty sheet.
  const hasListing = collection.floorEth > 0;

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

      {collection.resaleOpen ? (
        <div className="mt-6 px-4 sm:px-8 flex flex-wrap gap-2">
          {hasListing && <BuyFloorButton collection={collection} />}
          <MakeCollectionOfferButton collection={collection} />
        </div>
      ) : (
        <div className="mt-6 px-4 sm:px-8">
          <ResaleStatus remaining={collection.mintRemaining} />
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
        <CollectionOffersList collection={collection} />
        <DeleteCollection
          collectionId={collection.id}
          collectionName={collection.name}
          creatorAddress={collection.creatorAddress}
          mintedSupply={collection.mintedSupply}
        />
      </div>
    </div>
  );
}
