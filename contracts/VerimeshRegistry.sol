pragma solidity ^0.8.20;

contract VerimeshRegistry {
    event Committed(
        bytes32 indexed id,
        string nodeId,
        string operator,
        string action,
        string verdict,
        uint8 authTier,
        bytes32 zerogRoot,
        uint256 ts
    );

    event Frozen(
        bytes32 indexed id,
        string nodeId,
        string operator,
        string reason,
        uint8 requiredTier,
        uint8 requiredQuorum,
        uint256 ts
    );

    event HumanApproval(
        bytes32 indexed id,
        bytes32 worldIdNullifier,
        string operator,
        uint8 approvalIndex,
        uint256 ts
    );

    event OverrideResolved(
        bytes32 indexed id,
        string chosenAction,
        uint8 approvalsCollected,
        uint256 ts
    );

    error DuplicateNullifier(bytes32 id, bytes32 worldIdNullifier);
    error NoApprovals(bytes32 id);
    error ApprovalLengthMismatch(uint256 nullifiers, uint256 operators);
    error OverrideAlreadyResolved(bytes32 id);

    mapping(bytes32 => bool) public resolved;

    function commitDecision(
        bytes32 id,
        string calldata nodeId,
        string calldata operator,
        string calldata action,
        string calldata verdict,
        uint8 authTier,
        bytes32 zerogRoot
    ) external {
        emit Committed(id, nodeId, operator, action, verdict, authTier, zerogRoot, block.timestamp);
    }

    function freezeNode(
        bytes32 id,
        string calldata nodeId,
        string calldata operator,
        string calldata reason,
        uint8 requiredTier,
        uint8 requiredQuorum
    ) external {
        emit Frozen(id, nodeId, operator, reason, requiredTier, requiredQuorum, block.timestamp);
    }

    function resolveOverride(
        bytes32 id,
        string calldata chosenAction,
        bytes32[] calldata worldIdNullifiers,
        string[] calldata operators
    ) external {
        if (resolved[id]) revert OverrideAlreadyResolved(id);
        if (worldIdNullifiers.length == 0) revert NoApprovals(id);
        if (worldIdNullifiers.length != operators.length) {
            revert ApprovalLengthMismatch(worldIdNullifiers.length, operators.length);
        }

        for (uint256 i = 0; i < worldIdNullifiers.length; i++) {
            for (uint256 j = i + 1; j < worldIdNullifiers.length; j++) {
                if (worldIdNullifiers[i] == worldIdNullifiers[j]) {
                    revert DuplicateNullifier(id, worldIdNullifiers[i]);
                }
            }
        }

        resolved[id] = true;

        for (uint256 i = 0; i < worldIdNullifiers.length; i++) {
            emit HumanApproval(id, worldIdNullifiers[i], operators[i], uint8(i), block.timestamp);
        }

        emit OverrideResolved(id, chosenAction, uint8(worldIdNullifiers.length), block.timestamp);
    }
}
