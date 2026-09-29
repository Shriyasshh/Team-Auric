// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MediVaultAnchor {
    // Maps a record reference (e.g. UUID as string or bytes) to its SHA-256 hash
    // We use a string for the UUID to be safe and clear.
    // The hash is a hex string of the SHA-256 hash or bytes32. We will use string to store the exact SHA-256 hex string.
    mapping(string => string) private recordAnchors;
    
    // To track if a record has already been anchored to prevent overwriting
    mapping(string => bool) private isAnchored;

    event RecordAnchored(string indexed recordReference, string recordHash, uint256 timestamp);

    function anchorRecord(string memory recordReference, string memory recordHash) public {
        require(bytes(recordReference).length > 0, "Record reference cannot be empty");
        require(bytes(recordHash).length > 0, "Record hash cannot be empty");
        require(!isAnchored[recordReference], "Record is already anchored");

        recordAnchors[recordReference] = recordHash;
        isAnchored[recordReference] = true;

        emit RecordAnchored(recordReference, recordHash, block.timestamp);
    }

    function getRecordAnchor(string memory recordReference) public view returns (string memory) {
        require(isAnchored[recordReference], "Record is not anchored");
        return recordAnchors[recordReference];
    }
}
