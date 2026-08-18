// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title DurchexNFT1155
/// @notice ERC-1155 multi-edition collection contract with lazy-mint
/// voucher redemption. Unlike DurchexNFT's single-use NFTVoucher, an
/// EditionVoucher is reusable across many buyers — each redemption mints
/// `quantity` more units to a new buyer until `maxSupply` is reached,
/// matching a creator listing "500 units of Silver Sword at 0.05 ETH each"
/// once and different buyers each purchasing their own share.
contract DurchexNFT1155 is ERC1155URIStorage, ERC2981, EIP712, Ownable {
    using ECDSA for bytes32;

    struct EditionVoucher {
        uint256 tokenId;
        string uri;
        uint256 minPrice; // wei, per unit
        address creator;
        uint96 royaltyBps;
        uint256 maxSupply;
        uint256 nonce; // unique per edition (not incremented on redeem — a voucher is reused by many buyers)
        uint256 deadline; // unix seconds; 0 = no expiry
    }

    /// @notice Hard ceiling on creator royalties — see DurchexNFT for why
    /// this must be enforced on-chain and not only in the app.
    uint96 public constant MAX_ROYALTY_BPS = 3000; // 30%

    address public marketplace; // only this address may redeem
    mapping(uint256 tokenId => uint256) public minted;
    mapping(uint256 tokenId => bool) public cancelled;
    // Royalty/URI are set from the voucher once, on first redemption —
    // later redemptions of the same voucher just mint more units.
    mapping(uint256 tokenId => bool) private initialized;

    bytes32 private constant EDITION_VOUCHER_TYPEHASH =
        keccak256(
            "EditionVoucher(uint256 tokenId,string uri,uint256 minPrice,address creator,uint96 royaltyBps,uint256 maxSupply,uint256 nonce,uint256 deadline)"
        );

    event MarketplaceUpdated(address indexed marketplace);
    event EditionCancelled(address indexed creator, uint256 indexed tokenId);

    constructor() ERC1155("") EIP712("DurchexNFT1155", "1") Ownable(msg.sender) {}

    function setMarketplace(address _marketplace) external onlyOwner {
        marketplace = _marketplace;
        emit MarketplaceUpdated(_marketplace);
    }

    /// @dev Disabled for the same reason as DurchexNFT.renounceOwnership.
    function renounceOwnership() public view override onlyOwner {
        revert("DurchexNFT1155: renounce disabled");
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
    /// redemptions of an edition (e.g. pulling a listing) even if
    /// maxSupply hasn't been reached. Units already minted are unaffected.
    /// Self-authenticating via the same signature the buyer would've
    /// redeemed — no separate on-chain creator registry needed since
    /// minting is lazy (nothing may exist on-chain yet to check against).
    function cancelEdition(EditionVoucher calldata voucher, bytes calldata signature) external {
        address signer = hashVoucher(voucher).recoverCalldata(signature);
        require(signer == voucher.creator, "DurchexNFT1155: invalid signature");
        require(msg.sender == voucher.creator, "DurchexNFT1155: only creator");
        cancelled[voucher.tokenId] = true;
        emit EditionCancelled(voucher.creator, voucher.tokenId);
    }

    /// @notice Mints `quantity` units of `voucher.tokenId` directly to
    /// `buyer`. Callable repeatedly (by different buyers, different
    /// quantities) against the same signed voucher until `maxSupply` is
    /// reached — only callable by the marketplace contract so payment and
    /// mint always happen atomically.
    function redeem(
        address buyer,
        uint256 quantity,
        EditionVoucher calldata voucher,
        bytes calldata signature
    ) external returns (uint256) {
        require(msg.sender == marketplace, "DurchexNFT1155: only marketplace");
        require(quantity > 0, "DurchexNFT1155: zero quantity");
        require(!cancelled[voucher.tokenId], "DurchexNFT1155: edition cancelled");
        require(voucher.deadline == 0 || block.timestamp <= voucher.deadline, "DurchexNFT1155: voucher expired");
        require(minted[voucher.tokenId] + quantity <= voucher.maxSupply, "DurchexNFT1155: exceeds max supply");
        require(voucher.royaltyBps <= MAX_ROYALTY_BPS, "DurchexNFT1155: royalty exceeds cap");

        address signer = hashVoucher(voucher).recoverCalldata(signature);
        require(signer == voucher.creator, "DurchexNFT1155: invalid signature");

        if (!initialized[voucher.tokenId]) {
            _setURI(voucher.tokenId, voucher.uri);
            _setTokenRoyalty(voucher.tokenId, voucher.creator, voucher.royaltyBps);
            initialized[voucher.tokenId] = true;
        }

        minted[voucher.tokenId] += quantity;
        _mint(buyer, voucher.tokenId, quantity, "");

        return voucher.tokenId;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC1155, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
