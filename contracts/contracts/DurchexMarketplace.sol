// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "./DurchexNFT.sol";

/// @title DurchexMarketplace
/// @notice Settlement, platform fee and royalty splitting for fixed-price
/// sales (both lazy-minted and already-minted), and English auctions.
/// See docs/Durchex-NFT-Marketplace-Full-Specification.pdf section 5.2.
contract DurchexMarketplace is ReentrancyGuard {
    uint96 public constant PLATFORM_FEE_BPS = 250; // 2.5%
    address public feeRecipient;

    event VoucherRedeemed(address indexed nft, uint256 indexed tokenId, address buyer, uint256 price);
    event ListingFilled(
        address indexed nft,
        uint256 indexed tokenId,
        address seller,
        address buyer,
        uint256 price
    );
    event AuctionSettled(
        address indexed nft,
        uint256 indexed tokenId,
        address seller,
        address winner,
        uint256 amount
    );

    constructor(address _feeRecipient) {
        require(_feeRecipient != address(0), "DurchexMarketplace: zero fee recipient");
        feeRecipient = _feeRecipient;
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

    /// @notice Buy an already-minted item at a fixed price (standard resale).
    /// Requires the seller to have approved this contract to transfer the
    /// token (`approve`/`setApprovalForAll`).
    function buyListed(
        IERC721 nft,
        uint256 tokenId,
        address seller,
        uint256 price
    ) external payable nonReentrant {
        require(msg.value >= price, "DurchexMarketplace: insufficient payment");
        require(nft.ownerOf(tokenId) == seller, "DurchexMarketplace: seller no longer owns token");

        nft.safeTransferFrom(seller, msg.sender, tokenId);

        (address royaltyReceiver, uint256 royaltyAmt) = ERC2981(address(nft)).royaltyInfo(tokenId, price);
        uint96 royaltyBps = price == 0 ? 0 : uint96((royaltyAmt * 10000) / price);
        _settle(seller, royaltyReceiver, royaltyBps, price);

        emit ListingFilled(address(nft), tokenId, seller, msg.sender, price);
    }

    /// @notice Settles a finished English auction. Called by the seller or
    /// the winning bidder once the auction's end time has passed; the
    /// winning bid amount is forwarded as `msg.value` at settlement time
    /// (bids are tracked off-chain/signed until the winner actually pays —
    /// see spec section 15, "Escrow").
    function settleAuction(
        IERC721 nft,
        uint256 tokenId,
        address seller,
        address winner
    ) external payable nonReentrant {
        require(nft.ownerOf(tokenId) == seller, "DurchexMarketplace: seller no longer owns token");

        nft.safeTransferFrom(seller, winner, tokenId);

        (address royaltyReceiver, uint256 royaltyAmt) = ERC2981(address(nft)).royaltyInfo(
            tokenId,
            msg.value
        );
        uint96 royaltyBps = msg.value == 0 ? 0 : uint96((royaltyAmt * 10000) / msg.value);
        _settle(seller, royaltyReceiver, royaltyBps, msg.value);

        emit AuctionSettled(address(nft), tokenId, seller, winner, msg.value);
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

        payable(feeRecipient).transfer(fee);
        if (royalty > 0 && royaltyReceiver != seller) {
            payable(royaltyReceiver).transfer(royalty);
            payable(seller).transfer(sellerProceeds);
        } else {
            payable(seller).transfer(sellerProceeds + royalty);
        }
    }
}
