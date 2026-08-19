// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./DurchexCollection.sol";

/// @title DurchexCollectionFactory
/// @notice Deploys one ERC-721 per collection as an EIP-1167 clone, at an
/// address that is known before the deployment happens.
///
/// The deterministic address is the point. A collection is created off-chain
/// and free, and the creator can immediately sign lazy-mint vouchers against
/// its future contract address — the EIP-712 domain includes that address,
/// so it has to be settled up front. The clone itself is only deployed when
/// someone actually mints, so a collection that never sells costs nobody any
/// gas.
///
/// Salts are derived from the collection's database id, so the mapping
/// between a Durchex collection and its contract is reproducible from
/// either side and can't drift.
contract DurchexCollectionFactory is Ownable {
    /// @notice The implementation every collection clone delegates to.
    address public immutable implementation;

    /// @notice Marketplace each new clone is initialized to trust. Owner-
    /// updatable so a future marketplace redeploy doesn't strand new
    /// collections; existing clones keep whatever they were given and can be
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
        require(_marketplace != address(0), "DurchexCollectionFactory: zero marketplace");
        marketplace = _marketplace;
        implementation = address(new DurchexCollection());
    }

    function setMarketplace(address _marketplace) external onlyOwner {
        require(_marketplace != address(0), "DurchexCollectionFactory: zero marketplace");
        marketplace = _marketplace;
        emit MarketplaceUpdated(_marketplace);
    }

    /// @notice The address a collection will live at, whether or not it has
    /// been deployed yet. Safe to sign vouchers against.
    function predictCollection(bytes32 salt) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

    /// @notice Whether the clone for `salt` has actually been deployed.
    function isDeployed(bytes32 salt) external view returns (bool) {
        return predictCollection(salt).code.length > 0;
    }

    /// @notice Deploys the clone for `salt` if it doesn't exist yet, and
    /// returns its address either way.
    ///
    /// Deliberately idempotent and callable by anyone: the first mint of a
    /// collection triggers it, and that buyer shouldn't fail merely because
    /// they raced someone else to it. Nothing here is privileged — the salt
    /// and owner are fixed by whoever calls first, which is why the app
    /// derives the salt from the collection id and passes the real creator.
    function deployCollection(
        bytes32 salt,
        string calldata name_,
        string calldata symbol_,
        address owner_
    ) external returns (address collection) {
        require(owner_ != address(0), "DurchexCollectionFactory: zero owner");
        collection = predictCollection(salt);
        if (collection.code.length > 0) return collection;

        collection = Clones.cloneDeterministic(implementation, salt);
        DurchexCollection(collection).initialize(name_, symbol_, owner_, marketplace);
        emit CollectionDeployed(collection, salt, owner_, name_, symbol_);
    }
}
