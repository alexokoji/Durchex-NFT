// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./DurchexNFT.sol";
import "./DurchexNFT1155.sol";

/// @title DurchexMarketplace
/// @notice Settlement, platform fee and royalty splitting for fixed-price
/// sales (both lazy-minted and already-minted) and settled auctions.
/// See docs/Durchex-NFT-Marketplace-Full-Specification.pdf section 5.2.
contract DurchexMarketplace is ReentrancyGuard, Pausable, Ownable, EIP712 {
    using ECDSA for bytes32;
    using Address for address payable;

    /// @notice Hard ceiling on the platform fee, fixed at deploy time and
    /// impossible to raise — buyers can verify the fee can never exceed
    /// this no matter who owns the contract.
    uint96 public constant MAX_PLATFORM_FEE_BPS = 2000; // 20%
    /// @notice Current platform fee. Adjustable by the owner within
    /// MAX_PLATFORM_FEE_BPS so a rate change never requires a redeploy.
    uint96 public platformFeeBps = 1000; // 10%
    address public feeRecipient;

    /// @notice A seller-signed authorization to sell an already-minted
    /// token at `price`. `buyer` is address(0) for an open fixed-price
    /// listing anyone may fill, or a specific address when it authorizes
    /// only that buyer (e.g. an off-chain-negotiated auction winner).
    /// Replaces trusting a bare, unsigned price argument — the resale price
    /// is now cryptographically bound to what the seller actually agreed to.
    struct Listing {
        address nft;
        uint256 tokenId;
        address seller;
        address buyer; // 0 = anyone may buy
        uint256 price;
        uint256 deadline; // unix seconds; 0 = no expiry
        uint256 nonce;
    }

    mapping(address seller => mapping(uint256 nonce => bool used)) public usedListingNonce;

    /// @notice Same idea as Listing, but for a reusable ERC-1155 resale
    /// authorization: the seller signs "up to `quantity` units at
    /// `pricePerUnit`," and different buyers can each fill part of it until
    /// the full quantity is sold — unlike Listing, one signature can be
    /// filled by many separate transactions.
    struct Listing1155 {
        address nft;
        uint256 tokenId;
        address seller;
        address buyer; // 0 = anyone may buy
        uint256 quantity; // total units authorized under this listing
        uint256 pricePerUnit;
        uint256 deadline; // unix seconds; 0 = no expiry
        uint256 nonce;
    }

    mapping(address seller => mapping(uint256 nonce => uint256 filled)) public listing1155Filled;
    mapping(address seller => mapping(uint256 nonce => bool cancelled)) public listing1155Cancelled;

    bytes32 private constant LISTING_TYPEHASH =
        keccak256(
            "Listing(address nft,uint256 tokenId,address seller,address buyer,uint256 price,uint256 deadline,uint256 nonce)"
        );
    bytes32 private constant LISTING_1155_TYPEHASH =
        keccak256(
            "Listing1155(address nft,uint256 tokenId,address seller,address buyer,uint256 quantity,uint256 pricePerUnit,uint256 deadline,uint256 nonce)"
        );

    event VoucherRedeemed(address indexed nft, uint256 indexed tokenId, address buyer, uint256 price);
    event ListingFilled(
        address indexed nft,
        uint256 indexed tokenId,
        address seller,
        address buyer,
        uint256 price
    );
    event ListingCancelled(address indexed seller, uint256 nonce);
    event EditionRedeemed(
        address indexed nft,
        uint256 indexed tokenId,
        address buyer,
        uint256 quantity,
        uint256 totalPrice
    );
    event Listing1155Filled(
        address indexed nft,
        uint256 indexed tokenId,
        address seller,
        address buyer,
        uint256 quantity,
        uint256 totalPrice
    );
    event Listing1155Cancelled(address indexed seller, uint256 nonce);
    event PlatformFeeUpdated(uint96 bps);
    event FeeRecipientUpdated(address indexed feeRecipient);

    constructor(address _feeRecipient) EIP712("DurchexMarketplace", "1") Ownable(msg.sender) {
        require(_feeRecipient != address(0), "DurchexMarketplace: zero fee recipient");
        feeRecipient = _feeRecipient;
    }

    /// @notice Change the platform fee without redeploying. Bounded by the
    /// immutable MAX_PLATFORM_FEE_BPS ceiling.
    function setPlatformFee(uint96 bps) external onlyOwner {
        require(bps <= MAX_PLATFORM_FEE_BPS, "DurchexMarketplace: fee exceeds ceiling");
        platformFeeBps = bps;
        emit PlatformFeeUpdated(bps);
    }

    /// @notice Move fee income to a different wallet (e.g. a treasury or
    /// multisig, or in response to a key compromise) without redeploying.
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "DurchexMarketplace: zero fee recipient");
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    /// @notice Emergency stop for all purchase paths. Cancellations stay
    /// available while paused so sellers can always withdraw their listings.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev Renouncing would permanently strip the fee/pause controls this
    /// contract depends on, so it's disabled — ownership can still be
    /// transferred to a new owner via transferOwnership.
    function renounceOwnership() public view override onlyOwner {
        revert("DurchexMarketplace: renounce disabled");
    }

    function hashListing(Listing calldata l) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        LISTING_TYPEHASH,
                        l.nft,
                        l.tokenId,
                        l.seller,
                        l.buyer,
                        l.price,
                        l.deadline,
                        l.nonce
                    )
                )
            );
    }

    /// @notice Lets a seller invalidate a specific outstanding listing
    /// before it's purchased (unlisting, or reacting to a price change).
    function cancelListing(uint256 nonce) external {
        require(!usedListingNonce[msg.sender][nonce], "DurchexMarketplace: already used");
        usedListingNonce[msg.sender][nonce] = true;
        emit ListingCancelled(msg.sender, nonce);
    }

    function hashListing1155(Listing1155 calldata l) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        LISTING_1155_TYPEHASH,
                        l.nft,
                        l.tokenId,
                        l.seller,
                        l.buyer,
                        l.quantity,
                        l.pricePerUnit,
                        l.deadline,
                        l.nonce
                    )
                )
            );
    }

    /// @notice Stops further fills of an ERC-1155 resale listing, even if
    /// its authorized quantity hasn't fully sold.
    function cancelListing1155(uint256 nonce) external {
        listing1155Cancelled[msg.sender][nonce] = true;
        emit Listing1155Cancelled(msg.sender, nonce);
    }

    /// @notice Buy a not-yet-minted item: verifies + redeems the voucher on
    /// `nft`, then splits `msg.value` between the platform fee, the
    /// creator's royalty and the creator's sale proceeds. Since the creator
    /// is both seller and royalty receiver on a first sale, the royalty
    /// split simply keeps the creator's share whole.
    function buyLazy(
        DurchexNFT nft,
        DurchexNFT.NFTVoucher calldata voucher,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        require(msg.value >= voucher.minPrice, "DurchexMarketplace: insufficient payment");
        uint256 tokenId = nft.redeem(msg.sender, voucher, signature);
        _settle(voucher.creator, voucher.creator, voucher.royaltyBps, voucher.minPrice);
        _refundExcess(voucher.minPrice);
        emit VoucherRedeemed(address(nft), tokenId, msg.sender, voucher.minPrice);
    }

    /// @notice Buy an already-minted item — standard resale, or a settled
    /// auction (set `listing.buyer` to the agreed winner so only they can
    /// fill it). Requires the seller to have approved this contract to
    /// transfer the token (`approve`/`setApprovalForAll`), and requires the
    /// listing to be signed by `listing.seller` — price and buyer
    /// restriction are cryptographically bound to what the seller actually
    /// authorized, not trusted as bare call arguments.
    function buyListed(Listing calldata listing, bytes calldata signature) external payable nonReentrant whenNotPaused {
        require(listing.deadline == 0 || block.timestamp <= listing.deadline, "DurchexMarketplace: listing expired");
        require(!usedListingNonce[listing.seller][listing.nonce], "DurchexMarketplace: listing cancelled or already used");
        require(listing.buyer == address(0) || listing.buyer == msg.sender, "DurchexMarketplace: not the authorized buyer");

        address signer = hashListing(listing).recoverCalldata(signature);
        require(signer == listing.seller, "DurchexMarketplace: invalid signature");

        require(msg.value >= listing.price, "DurchexMarketplace: insufficient payment");
        IERC721 nft = IERC721(listing.nft);
        require(nft.ownerOf(listing.tokenId) == listing.seller, "DurchexMarketplace: seller no longer owns token");

        usedListingNonce[listing.seller][listing.nonce] = true;
        nft.safeTransferFrom(listing.seller, msg.sender, listing.tokenId);

        (address royaltyReceiver, uint256 royaltyAmt) = ERC2981(listing.nft).royaltyInfo(listing.tokenId, listing.price);
        uint96 royaltyBps = listing.price == 0 ? 0 : uint96((royaltyAmt * 10000) / listing.price);
        _settle(listing.seller, royaltyReceiver, royaltyBps, listing.price);
        _refundExcess(listing.price);

        emit ListingFilled(listing.nft, listing.tokenId, listing.seller, msg.sender, listing.price);
    }

    /// @notice Buy `quantity` not-yet-minted units of an ERC-1155 edition.
    /// The same voucher can be redeemed again by other buyers (or the same
    /// buyer, for more units) until the edition's maxSupply is reached —
    /// see DurchexNFT1155.redeem.
    function buyLazy1155(
        DurchexNFT1155 nft,
        uint256 quantity,
        DurchexNFT1155.EditionVoucher calldata voucher,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        require(quantity > 0, "DurchexMarketplace: zero quantity");
        uint256 totalPrice = voucher.minPrice * quantity;
        require(msg.value >= totalPrice, "DurchexMarketplace: insufficient payment");
        uint256 tokenId = nft.redeem(msg.sender, quantity, voucher, signature);
        _settle(voucher.creator, voucher.creator, voucher.royaltyBps, totalPrice);
        _refundExcess(totalPrice);
        emit EditionRedeemed(address(nft), tokenId, msg.sender, quantity, totalPrice);
    }

    /// @notice Buy `quantity` units of an already-minted ERC-1155 resale
    /// listing. `listing.quantity` is the total the seller authorized
    /// under this one signature — multiple buyers (or one buyer, multiple
    /// times) can each fill part of it until it's exhausted or cancelled.
    function buyListed1155(
        Listing1155 calldata listing,
        uint256 quantity,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        require(quantity > 0, "DurchexMarketplace: zero quantity");
        require(listing.deadline == 0 || block.timestamp <= listing.deadline, "DurchexMarketplace: listing expired");
        require(!listing1155Cancelled[listing.seller][listing.nonce], "DurchexMarketplace: listing cancelled");
        require(listing.buyer == address(0) || listing.buyer == msg.sender, "DurchexMarketplace: not the authorized buyer");
        require(
            listing1155Filled[listing.seller][listing.nonce] + quantity <= listing.quantity,
            "DurchexMarketplace: exceeds listing quantity"
        );

        address signer = hashListing1155(listing).recoverCalldata(signature);
        require(signer == listing.seller, "DurchexMarketplace: invalid signature");

        uint256 totalPrice = listing.pricePerUnit * quantity;
        require(msg.value >= totalPrice, "DurchexMarketplace: insufficient payment");
        IERC1155 nft = IERC1155(listing.nft);
        require(
            nft.balanceOf(listing.seller, listing.tokenId) >= quantity,
            "DurchexMarketplace: seller balance too low"
        );

        listing1155Filled[listing.seller][listing.nonce] += quantity;
        nft.safeTransferFrom(listing.seller, msg.sender, listing.tokenId, quantity, "");

        (address royaltyReceiver, uint256 royaltyAmt) = ERC2981(listing.nft).royaltyInfo(listing.tokenId, totalPrice);
        uint96 royaltyBps = totalPrice == 0 ? 0 : uint96((royaltyAmt * 10000) / totalPrice);
        _settle(listing.seller, royaltyReceiver, royaltyBps, totalPrice);
        _refundExcess(totalPrice);

        emit Listing1155Filled(listing.nft, listing.tokenId, listing.seller, msg.sender, quantity, totalPrice);
    }

    /// @dev Returns anything paid above the settled price. Without this,
    /// overpayment would sit in the contract permanently — there is no
    /// sweep function, so stuck ETH would be unrecoverable.
    function _refundExcess(uint256 settledAmount) internal {
        uint256 excess = msg.value - settledAmount;
        if (excess > 0) {
            payable(msg.sender).sendValue(excess);
        }
    }

    function _settle(
        address seller,
        address royaltyReceiver,
        uint96 royaltyBps,
        uint256 amount
    ) internal {
        uint256 fee = (amount * platformFeeBps) / 10000;
        uint256 royalty = (amount * royaltyBps) / 10000;
        // Defence in depth: the NFT contracts cap royaltyBps at mint time,
        // but a token from some other ERC-2981 contract could report a
        // royalty that, combined with the fee, exceeds the sale price.
        // Clamp rather than underflow-revert so such a token stays sellable.
        if (fee + royalty > amount) {
            royalty = amount - fee;
        }
        uint256 sellerProceeds = amount - fee - royalty;

        // Address.sendValue forwards all remaining gas (unlike the fixed
        // 2300-gas .transfer() stipend), so payouts to contract recipients
        // (e.g. a multisig fee recipient or a royalty receiver with a
        // non-trivial payable fallback) don't revert the whole sale.
        payable(feeRecipient).sendValue(fee);
        if (royalty > 0 && royaltyReceiver != seller) {
            payable(royaltyReceiver).sendValue(royalty);
            payable(seller).sendValue(sellerProceeds);
        } else {
            payable(seller).sendValue(sellerProceeds + royalty);
        }
    }
}
