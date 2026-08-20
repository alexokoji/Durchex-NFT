// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";

/// @title DurchexOffersEscrow
/// @notice Buyer-initiated offers denominated in native ETH.
///
/// The previous design (DurchexOffers) paid in WETH, for a real reason: a
/// holder accepting an offer is the one who submits the transaction, the
/// buyer is not in it, and native ETH can only be moved by its owner
/// signing the transaction that moves it. A signature alone cannot move
/// ETH, so payment had to be a token the contract could pull.
///
/// This contract removes that constraint by escrowing instead. The buyer
/// sends real ETH when they make the offer and it is held here until a
/// holder accepts or the buyer withdraws. Offers are therefore in ETH, and
/// — the part that matters more — every standing offer is *guaranteed
/// funded*. Under the pull model a buyer could spend their balance out
/// from under their own live offer, and the failure landed on whichever
/// holder tried to accept it.
///
/// The trade is that making an offer costs gas and locks the funds while
/// it stands. Withdrawal is always available, so nothing is ever stuck.
///
/// Offers live on-chain rather than as signatures, which also removes the
/// whole class of signature-mismatch failures: there is no typed data to
/// keep in step between contract and client.
///
/// Collection membership stays a merkle root over eligible token ids, not
/// an NFT contract address: several distinct collections share one
/// deployed ERC-721 here, so "same contract" would wrongly let an item
/// from another collection fill the offer. The same mechanism gives
/// trait criteria for free — whatever set the buyer committed to is
/// exactly the set that can fill.
contract DurchexOffersEscrow is ReentrancyGuard, Pausable, Ownable {
    using Address for address payable;

    uint96 public constant MAX_PLATFORM_FEE_BPS = 2000; // 20%
    uint96 public platformFeeBps = 1000; // 10%
    address public feeRecipient;

    struct Offer {
        address buyer;
        address nft;
        bool isERC1155;
        bytes32 criteriaRoot;
        uint256 pricePerItem;
        uint256 quantity;
        uint256 filled;
        uint256 deadline;
        /// Escrowed ETH still held for this offer. Tracked explicitly
        /// rather than derived from quantity, so a partially withdrawn or
        /// partially filled offer can never pay out more than it holds.
        uint256 escrow;
        bool cancelled;
    }

    uint256 public nextOfferId = 1;
    mapping(uint256 offerId => Offer) public offers;

    event OfferMade(
        uint256 indexed offerId,
        address indexed buyer,
        address indexed nft,
        bytes32 criteriaRoot,
        uint256 pricePerItem,
        uint256 quantity,
        uint256 deadline
    );
    event OfferFilled(
        uint256 indexed offerId,
        uint256 indexed tokenId,
        address indexed seller,
        address buyer,
        uint256 quantity,
        uint256 totalPrice
    );
    event OfferWithdrawn(uint256 indexed offerId, address indexed buyer, uint256 refunded);
    event PlatformFeeUpdated(uint96 bps);
    event FeeRecipientUpdated(address recipient);

    constructor(address _feeRecipient) Ownable(msg.sender) {
        require(_feeRecipient != address(0), "DurchexOffersEscrow: zero fee recipient");
        feeRecipient = _feeRecipient;
    }

    function setPlatformFee(uint96 bps) external onlyOwner {
        require(bps <= MAX_PLATFORM_FEE_BPS, "DurchexOffersEscrow: fee exceeds ceiling");
        platformFeeBps = bps;
        emit PlatformFeeUpdated(bps);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "DurchexOffersEscrow: zero fee recipient");
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Escrow ETH against an offer for any token in `criteriaRoot`.
    /// @param criteriaRoot merkle root over the eligible token ids. Zero
    /// means any token of `nft` qualifies.
    /// @dev msg.value must be exactly pricePerItem * quantity. Requiring
    /// exactness rather than a minimum avoids stranding change in the
    /// contract that nobody has a claim on.
    function makeOffer(
        address nft,
        bool isERC1155,
        bytes32 criteriaRoot,
        uint256 pricePerItem,
        uint256 quantity,
        uint256 deadline
    ) external payable whenNotPaused nonReentrant returns (uint256 offerId) {
        require(nft != address(0), "DurchexOffersEscrow: zero nft");
        require(pricePerItem > 0, "DurchexOffersEscrow: zero price");
        require(quantity > 0, "DurchexOffersEscrow: zero quantity");
        require(deadline == 0 || deadline > block.timestamp, "DurchexOffersEscrow: deadline passed");
        require(msg.value == pricePerItem * quantity, "DurchexOffersEscrow: wrong ETH amount");

        offerId = nextOfferId++;
        offers[offerId] = Offer({
            buyer: msg.sender,
            nft: nft,
            isERC1155: isERC1155,
            criteriaRoot: criteriaRoot,
            pricePerItem: pricePerItem,
            quantity: quantity,
            filled: 0,
            deadline: deadline,
            escrow: msg.value,
            cancelled: false
        });

        emit OfferMade(offerId, msg.sender, nft, criteriaRoot, pricePerItem, quantity, deadline);
    }

    /// @notice Reclaim the unfilled remainder of your own offer.
    /// @dev Always available to the buyer, including after expiry — an
    /// offer that can no longer be accepted must not trap the funds.
    function withdrawOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        require(offer.buyer == msg.sender, "DurchexOffersEscrow: not your offer");
        uint256 refund = offer.escrow;
        require(refund > 0, "DurchexOffersEscrow: nothing to withdraw");

        // Effects before the transfer: the refund is zeroed and the offer
        // closed before any ETH moves, so a re-entering receiver finds
        // nothing left to claim.
        offer.escrow = 0;
        offer.cancelled = true;

        payable(msg.sender).sendValue(refund);
        emit OfferWithdrawn(offerId, msg.sender, refund);
    }

    /// @notice Sell `quantity` of `tokenId` into an open offer.
    /// @param criteriaProof merkle proof that `tokenId` is eligible; empty
    /// when the offer names a single token, since the root is then the leaf.
    function acceptOffer(
        uint256 offerId,
        uint256 tokenId,
        uint256 quantity,
        bytes32[] calldata criteriaProof
    ) external whenNotPaused nonReentrant {
        Offer storage offer = offers[offerId];
        require(offer.buyer != address(0), "DurchexOffersEscrow: no such offer");
        require(!offer.cancelled, "DurchexOffersEscrow: offer withdrawn");
        require(quantity > 0, "DurchexOffersEscrow: zero quantity");
        require(
            offer.deadline == 0 || block.timestamp <= offer.deadline,
            "DurchexOffersEscrow: offer expired"
        );
        require(msg.sender != offer.buyer, "DurchexOffersEscrow: cannot fill your own offer");
        require(offer.filled + quantity <= offer.quantity, "DurchexOffersEscrow: exceeds offer quantity");

        if (offer.criteriaRoot != bytes32(0)) {
            require(
                MerkleProof.verifyCalldata(
                    criteriaProof,
                    offer.criteriaRoot,
                    keccak256(abi.encodePacked(tokenId))
                ),
                "DurchexOffersEscrow: token not eligible for this offer"
            );
        }

        uint256 totalPrice = offer.pricePerItem * quantity;
        require(offer.escrow >= totalPrice, "DurchexOffersEscrow: offer underfunded");

        // Effects before interactions — an NFT hook can re-enter, and
        // debiting first (with nonReentrant) makes over-fill impossible.
        offer.filled += quantity;
        offer.escrow -= totalPrice;

        if (offer.isERC1155) {
            IERC1155(offer.nft).safeTransferFrom(msg.sender, offer.buyer, tokenId, quantity, "");
        } else {
            require(quantity == 1, "DurchexOffersEscrow: ERC-721 quantity must be 1");
            IERC721(offer.nft).safeTransferFrom(msg.sender, offer.buyer, tokenId);
        }

        _settle(offer.nft, tokenId, msg.sender, totalPrice);

        emit OfferFilled(offerId, tokenId, msg.sender, offer.buyer, quantity, totalPrice);
    }

    /// @dev Splits escrowed ETH between platform, creator and seller. The
    /// royalty is read live from the NFT via ERC-2981 rather than taken
    /// from the offer, so a buyer cannot make an offer that underpays the
    /// creator.
    function _settle(address nft, uint256 tokenId, address seller, uint256 amount) internal {
        uint256 fee = (amount * platformFeeBps) / 10000;

        uint256 royalty = 0;
        address royaltyReceiver = address(0);
        try ERC2981(nft).royaltyInfo(tokenId, amount) returns (address receiver, uint256 royaltyAmt) {
            royaltyReceiver = receiver;
            royalty = royaltyAmt;
        } catch {
            // Not every NFT implements ERC-2981; treat that as no royalty
            // rather than blocking the sale.
        }
        // Clamp so a misbehaving royalty can never exceed what is left
        // after the fee, which would underflow and brick the token.
        if (fee + royalty > amount) {
            royalty = amount - fee;
        }
        uint256 sellerProceeds = amount - fee - royalty;

        if (fee > 0) payable(feeRecipient).sendValue(fee);
        if (royalty > 0 && royaltyReceiver != address(0) && royaltyReceiver != seller) {
            payable(royaltyReceiver).sendValue(royalty);
        } else {
            sellerProceeds += royalty;
        }
        payable(seller).sendValue(sellerProceeds);
    }

    /// @notice Escrow still held for an offer, for the UI to show a buyer
    /// what they can reclaim.
    function escrowOf(uint256 offerId) external view returns (uint256) {
        return offers[offerId].escrow;
    }
}
