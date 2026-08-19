// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./DurchexCollection1155.sol";

/// @title DurchexCollection1155Factory
/// @notice The ERC-1155 counterpart to DurchexCollectionFactory: one
/// contract per collection, at an address known before it is deployed.
///
/// A separate factory rather than an extension of the 721 one, because that
/// factory is already live on mainnet and holds its implementation in an
/// immutable — there is no way to teach it a second implementation without
/// redeploying it and invalidating every address it has already predicted.
///
/// Everything else mirrors the 721 factory deliberately: same salt scheme,
/// same deterministic prediction, same idempotent deploy. Divergence between
/// the two would be a source of subtle bugs, since the app derives addresses
/// for both with one shared code path.
contract DurchexCollection1155Factory is Ownable {
    /// @notice The implementation every collection clone delegates to.
    address public immutable implementation;

    /// @notice Marketplace each new clone is initialized to trust. Owner-
    /// updatable so a future marketplace redeploy doesn't strand new
    /// collections; existing clones keep what they were given and can be
    /// repointed by their own owner.
    address public marketplace;

    event CollectionDeployed(
        address indexed collection,
        bytes32 indexed salt,
        address indexed owner,
        string name,
        string symbol
    );
    event MarketplaceUpdated(address indexed marketplace);

    constructor(address _marketplace) Ownable(msg.sender) {
        require(_marketplace != address(0), "DurchexCollection1155Factory: zero marketplace");
        marketplace = _marketplace;
        implementation = address(new DurchexCollection1155());
    }

    function setMarketplace(address _marketplace) external onlyOwner {
        require(_marketplace != address(0), "DurchexCollection1155Factory: zero marketplace");
        marketplace = _marketplace;
        emit MarketplaceUpdated(_marketplace);
    }

    /// @notice The address a collection will live at, whether or not it has
    /// been deployed. Safe to sign vouchers against.
    function predictCollection(bytes32 salt) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

    function isDeployed(bytes32 salt) external view returns (bool) {
        return predictCollection(salt).code.length > 0;
    }

    /// @notice Deploys the clone for `salt` if it doesn't exist, returning
    /// its address either way. Idempotent and unpermissioned so that two
    /// buyers racing to be the first mint can't make one of them fail.
    function deployCollection(
        bytes32 salt,
        string calldata name_,
        string calldata symbol_,
        address owner_
    ) external returns (address collection) {
        require(owner_ != address(0), "DurchexCollection1155Factory: zero owner");
        collection = predictCollection(salt);
        if (collection.code.length > 0) return collection;

        collection = Clones.cloneDeterministic(implementation, salt);
        DurchexCollection1155(collection).initialize(name_, symbol_, owner_, marketplace);
        emit CollectionDeployed(collection, salt, owner_, name_, symbol_);
    }
}
