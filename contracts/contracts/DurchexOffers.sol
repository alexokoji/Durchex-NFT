// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title DurchexOffers
/// @notice Settlement for buyer-initiated offers, which the main
/// DurchexMarketplace structurally cannot handle: every function there
/// requires the *buyer* to be msg.sender sending msg.value, but an offer is
/// accepted by the *seller* — the buyer isn't in the transaction at all, so
/// native ETH can't move. Payment therefore uses a pre-approved ERC-20
/// (WETH), pulled from the buyer at accept time.
///
/// Deployed as a separate contract rather than an upgrade so the live
/// marketplace is untouched; it needs no changes to support this.
///
/// Collection membership is expressed as a merkle root over the eligible
/// token ids, NOT as an NFT contract address. In this marketplace many
/// distinct collections share one deployed ERC-721 (see
/// lib/web3/deployedContract.ts), so "same contract" would wrongly let an
/// item from another collection fill the offer. The same mechanism doubles
/// as trait/rarity criteria: whatever set the buyer signed is exactly the
/// set that can fill.
contract DurchexOffers is ReentrancyGuard, Pausable, Ownable, EIP712 {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;
    using Address for address payable;

    uint96 public constant MAX_PLATFORM_FEE_BPS = 2000; // 20%
    uint96 public platformFeeBps = 1000; // 10%
    address public feeRecipient;
    /// @notice The ERC-20 offers are denominated in (WETH). Immutable so a
    /// signed offer can never be settled in a different, cheaper token.
    IERC20 public immutable paymentToken;

    struct CollectionOffer {
        address nft; // NFT contract the token must live in
        bool isERC1155;
        bytes32 criteriaRoot; // merkle root of eligible tokenIds; 0 = any token in `nft`
        uint256 pricePerItem; // in paymentToken units
        uint256 quantity; // max items this offer will buy
        uint256 deadline; // unix seconds; 0 = no expiry
        uint256 nonce;
        address buyer;
    }

    bytes32 private constant COLLECTION_OFFER_TYPEHASH =
        keccak256(
            "CollectionOffer(address nft,bool isERC1155,bytes32 criteriaRoot,uint256 pricePerItem,uint256 quantity,uint256 deadline,uint256 nonce,address buyer)"
        );

    mapping(address buyer => mapping(uint256 nonce => uint256 filled)) public offerFilled;
    mapping(address buyer => mapping(uint256 nonce => bool cancelled)) public offerCancelled;

    event CollectionOfferFilled(
        address indexed nft,
        uint256 indexed tokenId,
        address indexed buyer,
        address seller,
        uint256 quantity,
        uint256 totalPrice,
        uint256 nonce
    );
    event CollectionOfferCancelled(address indexed buyer, uint256 nonce);
    event PlatformFeeUpdated(uint96 bps);
    event FeeRecipientUpdated(address indexed feeRecipient);

    constructor(address _paymentToken, address _feeRecipient) EIP712("DurchexOffers", "1") Ownable(msg.sender) {
        require(_paymentToken != address(0), "DurchexOffers: zero payment token");
        require(_feeRecipient != address(0), "DurchexOffers: zero fee recipient");
        paymentToken = IERC20(_paymentToken);
        feeRecipient = _feeRecipient;
    }

    function setPlatformFee(uint96 bps) external onlyOwner {
        require(bps <= MAX_PLATFORM_FEE_BPS, "DurchexOffers: fee exceeds ceiling");
        platformFeeBps = bps;
        emit PlatformFeeUpdated(bps);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "DurchexOffers: zero fee recipient");
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev Renouncing would strip the fee and pause controls permanently.
    function renounceOwnership() public view override onlyOwner {
        revert("DurchexOffers: renounce disabled");
    }

    function hashOffer(CollectionOffer calldata o) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        COLLECTION_OFFER_TYPEHASH,
                        o.nft,
                        o.isERC1155,
                        o.criteriaRoot,
                        o.pricePerItem,
                        o.quantity,
                        o.deadline,
                        o.nonce,
                        o.buyer
                    )
                )
            );
    }

    /// @notice Lets a buyer withdraw an outstanding offer. Only the buyer
    /// can cancel their own nonce, so this can't be used to grief others.
    function cancelOffer(uint256 nonce) external {
        offerCancelled[msg.sender][nonce] = true;
        emit CollectionOfferCancelled(msg.sender, nonce);
    }

    /// @notice Remaining units an offer can still buy, accounting for
    /// cancellation and expiry. Used by the app to display live state.
    function remainingQuantity(CollectionOffer calldata offer) external view returns (uint256) {
        if (offerCancelled[offer.buyer][offer.nonce]) return 0;
        if (offer.deadline != 0 && block.timestamp > offer.deadline) return 0;
        uint256 filled = offerFilled[offer.buyer][offer.nonce];
        return filled >= offer.quantity ? 0 : offer.quantity - filled;
    }

    /// @notice Seller-initiated fill of a buyer's signed collection offer.
    /// The caller must own the token and have approved this contract to
    /// move it; the buyer must have approved enough paymentToken.
    ///
    /// `criteriaProof` proves `tokenId` is in the set the buyer signed. When
    /// `criteriaRoot` is zero the offer is open to any token in `nft` and no
    /// proof is required.
    function acceptCollectionOffer(
        CollectionOffer calldata offer,
        bytes calldata signature,
        uint256 tokenId,
        uint256 quantity,
        bytes32[] calldata criteriaProof
    ) external nonReentrant whenNotPaused {
        require(quantity > 0, "DurchexOffers: zero quantity");
        require(offer.deadline == 0 || block.timestamp <= offer.deadline, "DurchexOffers: offer expired");
        require(!offerCancelled[offer.buyer][offer.nonce], "DurchexOffers: offer cancelled");
        require(msg.sender != offer.buyer, "DurchexOffers: cannot fill your own offer");
        require(
            offerFilled[offer.buyer][offer.nonce] + quantity <= offer.quantity,
            "DurchexOffers: exceeds offer quantity"
        );

        require(hashOffer(offer).recoverCalldata(signature) == offer.buyer, "DurchexOffers: invalid signature");

        // Eligibility: the token must be in the exact set the buyer signed.
        // Never inferred from anything the caller supplies beyond the proof.
        if (offer.criteriaRoot != bytes32(0)) {
            require(
                MerkleProof.verifyCalldata(criteriaProof, offer.criteriaRoot, keccak256(abi.encodePacked(tokenId))),
                "DurchexOffers: token not eligible for this offer"
            );
        }

        // Effects before interactions — a malicious NFT or token hook can
        // re-enter, and this (with nonReentrant) makes over-fill impossible.
        offerFilled[offer.buyer][offer.nonce] += quantity;

        uint256 totalPrice = offer.pricePerItem * quantity;

        if (offer.isERC1155) {
            require(quantity <= type(uint256).max, "DurchexOffers: bad quantity");
            IERC1155(offer.nft).safeTransferFrom(msg.sender, offer.buyer, tokenId, quantity, "");
        } else {
            require(quantity == 1, "DurchexOffers: ERC-721 quantity must be 1");
            IERC721(offer.nft).safeTransferFrom(msg.sender, offer.buyer, tokenId);
        }

        _settle(offer.nft, tokenId, msg.sender, offer.buyer, totalPrice);

        emit CollectionOfferFilled(offer.nft, tokenId, offer.buyer, msg.sender, quantity, totalPrice, offer.nonce);
    }

    /// @dev Pulls payment from the buyer and splits it. Royalty is read
    /// live from the NFT via ERC-2981 rather than taken from the offer, so
    /// a buyer can't sign an offer that underpays the creator.
    function _settle(address nft, uint256 tokenId, address seller, address buyer, uint256 amount) internal {
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
        // Clamp so a misbehaving royalty can never exceed what's left after
        // the fee (which would underflow and brick the token's sales).
        if (fee + royalty > amount) {
            royalty = amount - fee;
        }
        uint256 sellerProceeds = amount - fee - royalty;

        if (fee > 0) paymentToken.safeTransferFrom(buyer, feeRecipient, fee);
        if (royalty > 0 && royaltyReceiver != address(0) && royaltyReceiver != seller) {
            paymentToken.safeTransferFrom(buyer, royaltyReceiver, royalty);
        } else {
            sellerProceeds += royalty;
        }
        paymentToken.safeTransferFrom(buyer, seller, sellerProceeds);
    }
}
