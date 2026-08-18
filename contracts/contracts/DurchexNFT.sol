// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title DurchexNFT
/// @notice ERC-721 collection contract with lazy-mint voucher redemption.
/// Creators sign an off-chain EIP-712 `NFTVoucher` (free, no gas). The token
/// only exists on-chain once `redeem` is called by the marketplace contract
/// at the moment of purchase — see docs/Durchex-NFT-Marketplace-Full-Specification.pdf
/// section 5.1.
contract DurchexNFT is ERC721URIStorage, ERC2981, EIP712, Ownable {
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

    /// @notice Hard ceiling on creator royalties. Enforced here rather than
    /// only in the app, because vouchers are signed client-side — without
    /// an on-chain check a crafted voucher could set a royalty so high that
    /// fee + royalty exceeds the sale price, permanently bricking that token.
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

    constructor() ERC721("Durchex", "DRX") EIP712("Durchex", "1") Ownable(msg.sender) {}

    function setMarketplace(address _marketplace) external onlyOwner {
        marketplace = _marketplace;
        emit MarketplaceUpdated(_marketplace);
    }

    /// @dev Renouncing would make setMarketplace permanently uncallable,
    /// stranding this contract on whatever marketplace it currently trusts.
    /// Ownership can still be transferred.
    function renounceOwnership() public view override onlyOwner {
        revert("DurchexNFT: renounce disabled");
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

    /// @notice Lets a creator invalidate their next pending voucher without
    /// waiting for someone to redeem it. Vouchers are keyed to a strictly
    /// sequential per-creator nonce (see `nonces`), so at any time exactly
    /// one voucher is "next" — this simply skips it, matching how unlisting
    /// works everywhere else in the marketplace (creator-initiated, no
    /// counterparty needed).
    function cancelVoucher() external {
        uint256 cancelled = nonces[msg.sender];
        nonces[msg.sender] = cancelled + 1;
        emit VoucherCancelled(msg.sender, cancelled);
    }

    /// @notice Mints `voucher.tokenId` to `voucher.creator` then transfers it
    /// straight to `buyer`, in one transaction. Only callable by the
    /// marketplace contract so payment and mint always happen atomically.
    function redeem(
        address buyer,
        NFTVoucher calldata voucher,
        bytes calldata signature
    ) external returns (uint256) {
        require(msg.sender == marketplace, "DurchexNFT: only marketplace");
        require(!minted[voucher.tokenId], "DurchexNFT: already minted");
        require(voucher.nonce == nonces[voucher.creator], "DurchexNFT: bad nonce");
        require(voucher.deadline == 0 || block.timestamp <= voucher.deadline, "DurchexNFT: voucher expired");
        require(voucher.royaltyBps <= MAX_ROYALTY_BPS, "DurchexNFT: royalty exceeds cap");

        address signer = hashVoucher(voucher).recoverCalldata(signature);
        require(signer == voucher.creator, "DurchexNFT: invalid signature");

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
    ) public view override(ERC721URIStorage, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
