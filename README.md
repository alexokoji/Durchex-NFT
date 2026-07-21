# Durchex — NFT Marketplace

Purple x Black NFT marketplace built on Next.js 16 (App Router) and MongoDB, with a
Rarible-style Explore page and real lazy-minting (see the full spec).

📄 Full specification: [`docs/Durchex-NFT-Marketplace-Full-Specification.pdf`](docs/Durchex-NFT-Marketplace-Full-Specification.pdf)

## Getting started

```bash
npm install
npm run seed   # populates local MongoDB with demo collections/items/activity
npm run dev    # http://localhost:3000
```

No setup is required to get real MongoDB data locally: `lib/db.ts` automatically
starts a managed local MongoDB (via `mongodb-memory-server`) backed by the
`.local-mongo-data/` folder on first connection, so `npm run seed` and `npm run dev`
share the same database. To point at MongoDB Atlas instead, set `MONGODB_URI` in
`.env.local`.

> Run `npm run seed` before `npm run dev` the first time (or after wiping
> `.local-mongo-data/`) — and stop the dev server before re-seeding, since both
> processes try to start the local database on the same port.

Smart contracts live in [`contracts/`](contracts/) as a separate Hardhat project —
see [`contracts/README.md`](contracts/README.md) for compiling, testing, and deploying.

## What's built

**Browsing & discovery**
- **Home page** (`app/page.tsx`) — hero with floating 3D cards, trending
  collections, live auctions, top creators, featured drops, category grid with
  custom isometric 3D icons, lazy-minting explainer, stats band, testimonials
- **Explore page** (`app/explore/page.tsx`) — Rarible-style category tabs, filter
  sidebar (status, price range), sort, infinite-scroll grid
- **Collection page** (`app/collection/[slug]/page.tsx`) — banner + stats header,
  the same filter sidebar as Explore plus a trait-facet accordion aggregated
  live from MongoDB (`getCollectionTraitFacets`)
- **Item detail page** (`app/assets/[id]/page.tsx`) — media panel, price panel,
  creator/owner chips (linking to profiles), Properties/Offers/Activity/Details
  tabs, "More from this collection" carousel
- **Rankings page** (`app/rankings/page.tsx`) — collection leaderboard sortable
  by 24h / 7d / all-time volume
- **Profile page** (`app/profile/[address]/page.tsx`) — Owned / Created /
  Favorited tabs, Edit Profile button when viewing your own
- **Global Activity feed** (`app/activity/page.tsx`) — live-ish list of listings,
  sales, bids and offers across the whole marketplace, filterable by type
- **Search** (`app/search/page.tsx`, `components/layout/SearchBox.tsx`) — the
  navbar search box is a live debounced dropdown (items/collections/creators)
  backed by `GET /api/search`; Enter or "See all results" goes to the full
  results page. Regex-based substring match on name/username (no Atlas Search
  index available outside a real Atlas cluster — documented as a known
  simplification, not claiming fuzzy full-text search it doesn't have)
- **Stats page** (`app/stats/page.tsx`) — platform totals, a real items-by-category
  breakdown (`getCategoryCounts`), and a top-5 collections leaderboard reusing
  `RankingsTable`
- **Settings page** (`app/settings/page.tsx`) — edit username/bio/socials,
  `PATCH /api/users/me` (username uniqueness + format validated server-side).
  `ProfileHeader`'s "Edit Profile" button links here for your own profile

**Design system** — purple/black theme tokens, 3D elevation (`surface-card`,
hover-tilt), glass nav, glow accents (`app/globals.css`)

**Wallet connect + Sign-In With Ethereum** — wagmi + RainbowKit
(`lib/web3/config.ts`, `components/providers/Web3Providers.tsx`), custom-themed
connect button with a session-aware dropdown
(`components/wallet/ConnectWalletButton.tsx`). RainbowKit's modal is re-themed
to use the site's Inter font (`fonts.body` on the theme object — see the
comment in `Web3Providers.tsx` for why CSS-variable overrides didn't work).
Auth is a real SIWE flow: `/api/auth/nonce` issues a nonce cookie,
`/api/auth/verify` checks the signed message with `siwe` and upserts a `User`,
then issues an httpOnly JWT session cookie (`lib/auth/session.ts`, signed with
`SESSION_SECRET`). Signing in happens automatically the moment a wallet
connects — `hooks/useAutoSiweSignIn.ts` (a shared `react-query` query, so the
desktop and mobile connect buttons never race each other into double-signing)
requests the signature with no separate "Sign In" button; a brand-new wallet
sees a short onboarding modal once (`OnboardingModal.tsx` + `AutoAuthGate.tsx`).

**Network switcher** (`components/wallet/NetworkSwitcher.tsx`) — all 8 EVM
networks from the deployment-cost estimate (Ethereum, Base, Polygon, Arbitrum,
Optimism, Avalanche, BNB Chain, Hyperliquid) are wired into `wagmiConfig`
(`lib/web3/config.ts`) and listed for switching in two places: a standalone
dropdown in the header (compact icon-only on desktop, full-width on mobile),
and inline inside `ConnectWalletButton`'s connected-account dropdown. Both
call wagmi's `useSwitchChain` directly — no separate "add network" step, most
wallets add an unrecognized chain automatically since `wagmi/chains` ships
each one's RPC URL. Solana and Tezos aren't listed since they're not EVM at
all; a connected EVM wallet has no concept of switching to them (see the
"Not EVM-compatible" note in the deployment-cost discussion — those would
need a completely separate wallet integration, not just a config entry).

**Create / lazy-mint wizard** (`app/create/page.tsx`) — 4-step flow: pick or
create a collection + name/description, properties, pricing (fixed price /
auction / list-later), then review & sign. Signing builds a real EIP-712
`NFTVoucher` (`lib/web3/voucher.ts`) matching the exact struct in
`DurchexNFT.sol` and signs it client-side with wagmi's `useSignTypedData` —
free, no gas. `POST /api/items` stores it with `isMinted: false`, enforces a
per-creator nonce server-side (`User.nextVoucherNonce`, mirroring the
contract's `nonces[creator]` mapping) so a stale/replayed voucher is rejected
with 409, and updates the collection's item count / floor price.

**Bids & offers** (`lib/models/Bid.ts`, `app/api/bids/`) — real off-chain
writes: `POST /api/bids` places an auction bid (validated against the current
high and auction end time) or a direct offer; `POST /api/bids/[id]/accept`
lets the item's owner accept an offer (only the real owner, checked
server-side). Wired into the item detail page's price panel (inline bid/offer
forms replacing the old "coming soon" placeholder) and Offers tab (shows real
offers, Accept button for the owner).

**Favorites** (`lib/models/Favorite.ts`, `app/api/favorites/`) — the heart
button on cards and the item page is wired to real per-user persistence,
reflected on the owner's Profile page.

**Follow system** (`lib/models/Follow.ts`, `app/api/follow/[address]/`) — a
real Follow/Following button on other users' profiles (`hooks/useFollow.ts`),
toggling `POST /api/follow/[address]` and incrementing/decrementing real
`followerCount`/`followingCount` on both users (layered on top of the seed
script's random baseline counts, same pattern as `favoriteCount`). Following
someone sends them a `follow` notification.

**Notifications** (`lib/models/Notification.ts`, `app/notifications/page.tsx`,
`components/notifications/NotificationBell.tsx`) — created automatically when
someone bids or offers on your item, when you're outbid, or when your offer is
accepted (`lib/notifications.ts`). Navbar bell polls every 20s and shows an
unread badge; self-notifications are suppressed.

**Global Activity** (`lib/activity.ts`) — every listing, bid, offer, mint and
sale writes an `Activity` record; the seed script backfills realistic activity
history (spread over the last 3 weeks) for all demo data so the feed isn't empty.

**Smart contracts** (`contracts/`) — separate Hardhat project (own
`package.json`, doesn't collide with the app's wagmi/viem toolchain).
`DurchexNFT.sol` (ERC-721, EIP-712 lazy-mint voucher redemption, EIP-2981
royalties) and `DurchexMarketplace.sol` (fixed-price sales, resales, English
auction settlement, 2.5% platform fee + royalty splitting), both matching the
spec PDF section 5 exactly. 11 passing tests covering voucher redemption,
replay protection, access control, and fee/royalty math
(`npm test` inside `contracts/`). Not deployed anywhere yet — see
`contracts/README.md` for deploying to Polygon Amoy.

**Chain-event indexer** (`scripts/indexer.ts`, `npm run indexer`) — a viem
worker watching `VoucherRedeemed`/`ListingFilled`/`AuctionSettled` on
`DurchexMarketplace` and syncing MongoDB (Item owner/status/tokenId,
Collection stats, an `Activity` record with the real tx hash) — the piece that
makes on-chain truth authoritative instead of trusting client-reported state.
Verified against a real local Hardhat node: deployed both contracts, seeded a
matching lazy `Item`, fired a real signed-voucher `buyLazy` transaction from a
second test wallet, and confirmed the indexer picked up the on-chain event and
wrote the exact expected state to MongoDB (mint, owner, price, collection
sales/volume, activity row with the transaction hash) within seconds — not a
mocked test, an actual chain → indexer → MongoDB round trip. Needs
`DURCHEX_NFT_ADDRESS` / `DURCHEX_MARKETPLACE_ADDRESS` (from
`contracts/deployments.json` after a real deploy) to run against a live network.

**MongoDB models** (`lib/models/`) — `User`, `Collection`, `Item`, `Bid`,
`Favorite`, `Notification`, `Activity`, matching the spec's data model.

**Verification note:** this dev sandbox has no wallet browser extension, so
multi-step flows that need a real signature (sign-in, create/mint, bidding,
accepting offers) were verified with scripted end-to-end tests using `viem`
test wallets driving the actual API routes and EIP-712 signing — not just unit
tests of isolated functions. Worth a manual click-through with a real wallet
when you get the chance.

## Real on-chain checkout

One seeded collection (`neon-ronin`) is wired to a real deployment for
end-to-end testing without needing testnet funds:

```bash
cd contracts && npx hardhat node                          # terminal 1 — persistent local chain
cd contracts && npm run deploy:local                       # terminal 2 — deploys + writes deployments.json
# point neon-ronin's Collection.contractAddress at the deployed DurchexNFT
# address and set its chainId to 31337 (a one-off DB update — see git history
# for the exact script used during development)
DURCHEX_NFT_ADDRESS=<...> DURCHEX_MARKETPLACE_ADDRESS=<...> npm run indexer  # terminal 3
NEXT_PUBLIC_MARKETPLACE_ADDRESS=<...> npm run dev                            # terminal 4
```

Any unminted item in `neon-ronin` then shows a real **"Buy & Mint (on-chain)"**
button (`components/item/BuyLazyButton.tsx`) instead of the "not wired up yet"
notice — it calls `wagmi`'s `useWriteContract` against the actual
`DurchexMarketplace.buyLazy`, switches the wallet to the `hardhat` chain
(`lib/web3/config.ts`) if needed, and the indexer picks up the `VoucherRedeemed`
event to sync MongoDB. Every other collection still shows the honest "not wired
up yet" notice since it has no real contract behind it.

**Verified for real** (no wallet extension in this sandbox, so driven directly
with a `viem` test wallet exactly as a browser wallet would): created a lazy
item through the actual `/api/items` create flow with a real EIP-712
signature, executed a real `buyLazy` transaction from a different funded
Hardhat account, confirmed on-chain via `ownerOf()` that the token minted to
the buyer, and confirmed the indexer synced MongoDB so the item page correctly
dropped its "Unminted" badge and linked to the buyer's profile.

## Not built yet (see spec PDF for design)

- Wiring Place Bid / Make Offer / Accept Offer / auction settlement to real
  on-chain execution — they're real off-chain-signed records today (see the
  Bid/Offer section above); only Buy Now calls the deployed contract
- Extending the real-contract wiring to more than one collection (would need
  either a per-collection contract deployment or a factory pattern — the
  current `DurchexNFT` is a single shared contract, matching the spec, but
  the seed data was designed around each collection eventually getting its
  own address)
