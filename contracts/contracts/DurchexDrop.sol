// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IDurchexPass {
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

/// @notice Primary-drop ERC-721 with optional whitelist, OG, public and
/// token-gated phases. `allocation == 0` and `walletLimit == 0` mean unlimited.
contract DurchexDrop is ERC721, ERC721URIStorage, ERC2981, ReentrancyGuard, Ownable {
    using Strings for uint256;
    enum Phase { Whitelist, OG, Public }
    struct MintPhase {
        bool enabled;
        uint64 startsAt;
        uint64 endsAt; // 0 means no end
        uint96 priceWei;
        uint32 allocation; // 0 means unlimited, bounded by maxSupply
        uint32 minted;
        uint32 walletLimit; // 0 means unlimited
        bytes32 merkleRoot;
        address passContract;
        uint256 passId;
    }

    uint256 public immutable maxSupply; // 0 means unlimited
    uint256 public totalMinted;
    string private baseTokenURI;
    address public payoutRecipient;
    mapping(Phase phase => MintPhase) public phases;
    mapping(Phase phase => mapping(address wallet => uint256)) public mintedByWallet;

    event MintPhaseConfigured(Phase indexed phase, bool enabled, uint96 priceWei, uint32 allocation, uint32 walletLimit);
    event DropMinted(Phase indexed phase, address indexed minter, uint256 indexed firstTokenId, uint256 quantity, uint256 paid);
    event PayoutRecipientUpdated(address indexed recipient);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        string memory baseTokenURI_,
        address payoutRecipient_,
        address royaltyRecipient_,
        uint96 royaltyBps_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        require(payoutRecipient_ != address(0), "DurchexDrop: zero payout");
        require(royaltyBps_ <= 1000, "DurchexDrop: royalty too high");
        maxSupply = maxSupply_;
        baseTokenURI = baseTokenURI_;
        payoutRecipient = payoutRecipient_;
        if (royaltyRecipient_ != address(0) && royaltyBps_ > 0) _setDefaultRoyalty(royaltyRecipient_, royaltyBps_);
    }

    function configurePhase(Phase phase, MintPhase calldata config) external onlyOwner {
        require(config.endsAt == 0 || config.endsAt > config.startsAt, "DurchexDrop: invalid schedule");
        if (phase != Phase.Public && config.enabled) require(config.merkleRoot != bytes32(0), "DurchexDrop: missing allowlist");
        require(config.allocation == 0 || config.allocation >= phases[phase].minted, "DurchexDrop: allocation below minted");
        MintPhase memory updated = config;
        updated.minted = phases[phase].minted;
        phases[phase] = updated;
        emit MintPhaseConfigured(phase, config.enabled, config.priceWei, config.allocation, config.walletLimit);
    }

    function setBaseURI(string calldata uri) external onlyOwner { baseTokenURI = uri; }
    function setPayoutRecipient(address recipient) external onlyOwner { require(recipient != address(0), "DurchexDrop: zero payout"); payoutRecipient = recipient; emit PayoutRecipientUpdated(recipient); }

    function mint(Phase phase, uint256 quantity, bytes32[] calldata proof) external payable nonReentrant {
        MintPhase storage config = phases[phase];
        require(config.enabled, "DurchexDrop: phase disabled");
        require(quantity > 0, "DurchexDrop: zero quantity");
        require(block.timestamp >= config.startsAt, "DurchexDrop: phase not started");
        require(config.endsAt == 0 || block.timestamp <= config.endsAt, "DurchexDrop: phase ended");
        require(msg.value == uint256(config.priceWei) * quantity, "DurchexDrop: incorrect payment");
        if (phase != Phase.Public) require(MerkleProof.verify(proof, config.merkleRoot, keccak256(abi.encodePacked(msg.sender))), "DurchexDrop: not allowlisted");
        if (config.passContract != address(0)) require(IDurchexPass(config.passContract).balanceOf(msg.sender, config.passId) > 0, "DurchexDrop: pass required");
        if (config.walletLimit != 0) require(mintedByWallet[phase][msg.sender] + quantity <= config.walletLimit, "DurchexDrop: wallet limit");
        if (config.allocation != 0) require(config.minted + quantity <= config.allocation, "DurchexDrop: phase sold out");
        if (maxSupply != 0) require(totalMinted + quantity <= maxSupply, "DurchexDrop: sold out");

        uint256 firstTokenId = totalMinted + 1;
        mintedByWallet[phase][msg.sender] += quantity;
        config.minted += uint32(quantity);
        for (uint256 i; i < quantity; ++i) _safeMint(msg.sender, ++totalMinted);
        emit DropMinted(phase, msg.sender, firstTokenId, quantity, msg.value);
    }

    function withdraw() external nonReentrant {
        (bool sent,) = payable(payoutRecipient).call{value: address(this).balance}("");
        require(sent, "DurchexDrop: payout failed");
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(baseTokenURI, "/", tokenId.toString(), ".json");
    }
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage, ERC2981) returns (bool) { return super.supportsInterface(interfaceId); }
}
