// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice A reusable ERC-1155 membership pass. Drop contracts can require a
/// holder to own a pass token before a gated mint phase is available.
contract DurchexPass is ERC1155, Ownable {
    uint256 public nextPassId = 1;
    mapping(uint256 passId => string) private passURIs;

    event PassCreated(uint256 indexed passId, string uri);

    constructor() ERC1155("") Ownable(msg.sender) {}

    function createPass(address recipient, uint256 amount, string calldata metadataUri)
        external
        onlyOwner
        returns (uint256 passId)
    {
        require(recipient != address(0), "DurchexPass: zero recipient");
        require(amount > 0, "DurchexPass: zero amount");
        passId = nextPassId++;
        passURIs[passId] = metadataUri;
        _mint(recipient, passId, amount, "");
        emit PassCreated(passId, metadataUri);
    }

    function mint(address recipient, uint256 passId, uint256 amount) external onlyOwner {
        require(amount > 0, "DurchexPass: zero amount");
        _mint(recipient, passId, amount, "");
    }

    function uri(uint256 passId) public view override returns (string memory) {
        return passURIs[passId];
    }
}
