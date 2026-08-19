// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title DurchexCollection
/// @notice Per-collection ERC-721, deployed as an EIP-1167 clone by
/// DurchexCollectionFactory. Behaviourally identical to DurchexNFT — same
/// NFTVoucher, same lazy-mint redemption — but every collection gets its
/// own contract address instead of sharing one.
///
/// That sharing was a real problem, not a cosmetic one: on any explorer or
/// external marketplace, one contract is one collection, so every Durchex
/// creator's work appeared merged into a single collection alongside
/// everyone else's. It also forced token ids to be unique across all
/// collections at once, and left creator nonces shared between unrelated
/// projects.
///
/// Clones can't run constructors, so state that DurchexNFT set there is set
/// in `initialize` instead, guarded so it can only ever run once. The
/// EIP-712 domain binds to address(this), which differs per clone, so each
/// collection's vouchers are automatically non-transferable to another
/// collection's contract.
contract DurchexCollection is
    ERC721URIStorageUpgradeable,
    ERC2981Upgradeable,
    EIP712Upgradeable,
    OwnableUpgradeable
{
    using ECDSA for bytes32;

    struct NFTVoucher {
        uint256 tokenId;
        string uri;
        uint256 minPrice; // wei, floor the marketplace must honor
        address creator;
        uint96 royaltyBps;
        uint256 nonce; // replay protection per creator
        uint256 deadline; // unix seconds; 0 = no expiry
    }

    /// @notice Hard ceiling on creator royalties, enforced on-chain because
    /// vouchers are signed client-side — see DurchexNFT for the full
    /// reasoning.
    uint96 public constant MAX_ROYALTY_BPS = 3000; // 30%

    address public marketplace; // only this address may redeem
    mapping(uint256 tokenId => bool) public minted;
    mapping(address creator => uint256 nonce) public nonces;

    bytes32 private constant VOUCHER_TYPEHASH =
        keccak256(
            "NFTVoucher(uint256 tokenId,string uri,uint256 minPrice,address creator,uint96 royaltyBps,uint256 nonce,uint256 deadline)"
        );

    event MarketplaceUpdated(address indexed marketplace);
    event VoucherCancelled(address indexed creator, uint256 nonce);

    /// @dev Locks the implementation itself so nobody can initialize the
    /// contract the clones delegate to and take ownership of it.
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string calldata name_,
        string calldata symbol_,
        address owner_,
        address marketplace_
    ) external initializer {
        __ERC721_init(name_, symbol_);
        __ERC721URIStorage_init();
        __ERC2981_init();
        // Every clone shares one EIP-712 domain name/version; what separates
        // them is address(this), which the domain includes.
        __EIP712_init("Durchex", "1");
        __Ownable_init(owner_);
        marketplace = marketplace_;
        emit MarketplaceUpdated(marketplace_);
    }

    function setMarketplace(address _marketplace) external onlyOwner {
        marketplace = _marketplace;
        emit MarketplaceUpdated(_marketplace);
    }

    /// @dev Renouncing would strand this collection on whatever marketplace
    /// it currently trusts, with no way to repoint it.
    function renounceOwnership() public view override onlyOwner {
        revert("DurchexCollection: renounce disabled");
    }

    function hashVoucher(NFTVoucher calldata v) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        VOUCHER_TYPEHASH,
                        v.tokenId,
                        keccak256(bytes(v.uri)),
                        v.minPrice,
                        v.creator,
                        v.royaltyBps,
                        v.nonce,
                        v.deadline
                    )
                )
            );
    }

    /// @notice Lets a creator skip their next pending voucher without
    /// waiting for it to be redeemed.
    function cancelVoucher() external {
        uint256 cancelled = nonces[msg.sender];
        nonces[msg.sender] = cancelled + 1;
        emit VoucherCancelled(msg.sender, cancelled);
    }

    /// @notice Mints to the creator then transfers straight to the buyer, in
    /// one transaction. Marketplace-only so payment and mint stay atomic.
    function redeem(
        address buyer,
        NFTVoucher calldata voucher,
        bytes calldata signature
    ) external returns (uint256) {
        require(msg.sender == marketplace, "DurchexCollection: only marketplace");
        require(!minted[voucher.tokenId], "DurchexCollection: already minted");
        require(voucher.nonce == nonces[voucher.creator], "DurchexCollection: bad nonce");
        require(
            voucher.deadline == 0 || block.timestamp <= voucher.deadline,
            "DurchexCollection: voucher expired"
        );
        require(voucher.royaltyBps <= MAX_ROYALTY_BPS, "DurchexCollection: royalty exceeds cap");

        address signer = hashVoucher(voucher).recoverCalldata(signature);
        require(signer == voucher.creator, "DurchexCollection: invalid signature");

        minted[voucher.tokenId] = true;
        nonces[voucher.creator]++;

        _mint(voucher.creator, voucher.tokenId);
        _setTokenURI(voucher.tokenId, voucher.uri);
        _setTokenRoyalty(voucher.tokenId, voucher.creator, voucher.royaltyBps);
        _transfer(voucher.creator, buyer, voucher.tokenId);

        return voucher.tokenId;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721URIStorageUpgradeable, ERC2981Upgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
