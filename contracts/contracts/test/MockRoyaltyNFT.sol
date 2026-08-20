// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";

/// A minimal ERC-721 that reports a royalty, for exercising settlement
/// splits without dragging a whole collection contract into the test.
contract MockRoyaltyNFT is ERC721, ERC2981 {
    constructor(address royaltyReceiver, uint96 royaltyBps) ERC721("Mock", "MOCK") {
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
