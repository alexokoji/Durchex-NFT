// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./DurchexNFT.sol";

/// @title DurchexMarketplace
/// @notice Settlement, platform fee and royalty splitting for fixed-price
/// sales (both lazy-minted and already-minted) and settled auctions.
/// See docs/Durchex-NFT-Marketplace-Full-Specification.pdf section 5.2.
contract DurchexMarketplace is ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;
    using Address for address payable;

    uint96 public constant PLATFORM_FEE_BPS = 1000; // 10%
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

    bytes32 private constant LISTING_TYPEHASH =
        keccak256(
            "Listing(address nft,uint256 tokenId,address seller,address buyer,uint256 price,uint256 deadline,uint256 nonce)"
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

    constructor(address _feeRecipient) EIP712("DurchexMarketplace", "1") {
        require(_feeRecipient != address(0), "DurchexMarketplace: zero fee recipient");
        feeRecipient = _feeRecipient;
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

    /// @notice Buy a not-yet-minted item: verifies + redeems the voucher on
    /// `nft`, then splits `msg.value` between the platform fee, the
    /// creator's royalty and the creator's sale proceeds. Since the creator
    /// is both seller and royalty receiver on a first sale, the royalty
    /// split simply keeps the creator's share whole.
    function buyLazy(
        DurchexNFT nft,
        DurchexNFT.NFTVoucher calldata voucher,
        bytes calldata signature
    ) external payable nonReentrant {
        require(msg.value >= voucher.minPrice, "DurchexMarketplace: insufficient payment");
        uint256 tokenId = nft.redeem(msg.sender, voucher, signature);
        _settle(voucher.creator, voucher.creator, voucher.royaltyBps, msg.value);
        emit VoucherRedeemed(address(nft), tokenId, msg.sender, msg.value);
    }

    /// @notice Buy an already-minted item — standard resale, or a settled
    /// auction (set `listing.buyer` to the agreed winner so only they can
    /// fill it). Requires the seller to have approved this contract to
    /// transfer the token (`approve`/`setApprovalForAll`), and requires the
    /// listing to be signed by `listing.seller` — price and buyer
    /// restriction are cryptographically bound to what the seller actually
    /// authorized, not trusted as bare call arguments.
    function buyListed(Listing calldata listing, bytes calldata signature) external payable nonReentrant {
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

        emit ListingFilled(listing.nft, listing.tokenId, listing.seller, msg.sender, listing.price);
    }

    function _settle(
        address seller,
        address royaltyReceiver,
        uint96 royaltyBps,
        uint256 amount
    ) internal {
        uint256 fee = (amount * PLATFORM_FEE_BPS) / 10000;
        uint256 royalty = (amount * royaltyBps) / 10000;
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
