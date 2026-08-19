// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title DurchexCollection1155
/// @notice Per-collection ERC-1155, deployed as an EIP-1167 clone by
/// DurchexCollection1155Factory. Behaviourally identical to DurchexNFT1155 —
/// same reusable EditionVoucher, same supply accounting — but each
/// collection gets its own contract address rather than sharing one, for the
/// same reason the ERC-721 side did: on any explorer or external
/// marketplace, one contract is one collection, so a shared contract merges
/// every creator's work into a single listing alongside everyone else's.
///
/// The EIP-712 domain name is deliberately unchanged from DurchexNFT1155.
/// The domain also includes address(this), which differs per clone, so
/// isolation comes from the address — keeping the name identical means the
/// app's existing voucher signing works against these without modification.
contract DurchexCollection1155 is
    ERC1155URIStorageUpgradeable,
    ERC2981Upgradeable,
    EIP712Upgradeable,
    OwnableUpgradeable
{
    using ECDSA for bytes32;

    struct EditionVoucher {
        uint256 tokenId;
        string uri;
        uint256 minPrice; // wei, per unit
        address creator;
        uint96 royaltyBps;
        uint256 maxSupply;
        uint256 nonce; // unique per edition; not incremented on redeem, since one voucher serves many buyers
        uint256 deadline; // unix seconds; 0 = no expiry
    }

    /// @notice Hard ceiling on creator royalties, enforced on-chain because
    /// vouchers are signed client-side.
    uint96 public constant MAX_ROYALTY_BPS = 3000; // 30%

    /// @notice ERC-1155 has no name/symbol in the standard, but explorers
    /// and marketplaces read them for display — without these every clone
    /// would render as an unnamed contract, undoing the point of splitting
    /// collections apart in the first place.
    string public name;
    string public symbol;

    address public marketplace; // only this address may redeem
    mapping(uint256 tokenId => uint256) public minted;
    mapping(uint256 tokenId => bool) public cancelled;
    // URI and royalty are set from the voucher on first redemption only;
    // later redemptions of the same voucher just mint more units.
    mapping(uint256 tokenId => bool) private tokenInitialized;

    bytes32 private constant EDITION_VOUCHER_TYPEHASH =
        keccak256(
            "EditionVoucher(uint256 tokenId,string uri,uint256 minPrice,address creator,uint96 royaltyBps,uint256 maxSupply,uint256 nonce,uint256 deadline)"
        );

    event MarketplaceUpdated(address indexed marketplace);
    event EditionCancelled(address indexed creator, uint256 indexed tokenId);

    /// @dev Locks the implementation so nobody can initialize the contract
    /// the clones delegate to and take ownership of it.
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string calldata name_,
        string calldata symbol_,
        address owner_,
        address marketplace_
    ) external initializer {
        __ERC1155_init("");
        __ERC1155URIStorage_init();
        __ERC2981_init();
        __EIP712_init("DurchexNFT1155", "1");
        __Ownable_init(owner_);
        name = name_;
        symbol = symbol_;
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
        revert("DurchexCollection1155: renounce disabled");
    }

    function hashVoucher(EditionVoucher calldata v) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        EDITION_VOUCHER_TYPEHASH,
                        v.tokenId,
                        keccak256(bytes(v.uri)),
                        v.minPrice,
                        v.creator,
                        v.royaltyBps,
                        v.maxSupply,
                        v.nonce,
                        v.deadline
                    )
                )
            );
    }

    /// @notice Lets a creator permanently stop further primary-sale
    /// redemptions of an edition. Units already minted are unaffected.
    function cancelEdition(EditionVoucher calldata voucher, bytes calldata signature) external {
        address signer = hashVoucher(voucher).recoverCalldata(signature);
        require(signer == voucher.creator, "DurchexCollection1155: invalid signature");
        require(msg.sender == voucher.creator, "DurchexCollection1155: only creator");
        cancelled[voucher.tokenId] = true;
        emit EditionCancelled(voucher.creator, voucher.tokenId);
    }

    /// @notice Mints `quantity` units of `voucher.tokenId` directly to
    /// `buyer`. Callable repeatedly against the same signed voucher, by
    /// different buyers and in different quantities, until `maxSupply` is
    /// reached. Marketplace-only so payment and mint stay atomic.
    function redeem(
        address buyer,
        uint256 quantity,
        EditionVoucher calldata voucher,
        bytes calldata signature
    ) external returns (uint256) {
        require(msg.sender == marketplace, "DurchexCollection1155: only marketplace");
        require(quantity > 0, "DurchexCollection1155: zero quantity");
        require(!cancelled[voucher.tokenId], "DurchexCollection1155: edition cancelled");
        require(
            voucher.deadline == 0 || block.timestamp <= voucher.deadline,
            "DurchexCollection1155: voucher expired"
        );
        require(
            minted[voucher.tokenId] + quantity <= voucher.maxSupply,
            "DurchexCollection1155: exceeds max supply"
        );
        require(voucher.royaltyBps <= MAX_ROYALTY_BPS, "DurchexCollection1155: royalty exceeds cap");

        address signer = hashVoucher(voucher).recoverCalldata(signature);
        require(signer == voucher.creator, "DurchexCollection1155: invalid signature");

        if (!tokenInitialized[voucher.tokenId]) {
            _setURI(voucher.tokenId, voucher.uri);
            _setTokenRoyalty(voucher.tokenId, voucher.creator, voucher.royaltyBps);
            tokenInitialized[voucher.tokenId] = true;
        }

        minted[voucher.tokenId] += quantity;
        _mint(buyer, voucher.tokenId, quantity, "");

        return voucher.tokenId;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC1155Upgradeable, ERC2981Upgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
