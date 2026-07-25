pragma solidity ^0.8.20;

contract VerimeshRegistry {
    event Committed(
        bytes32 indexed id,
        string nodeId,
        string operator,
        string action,
        string verdict,
        bytes32 zerogRoot,
        uint256 ts
    );

    event Frozen(
        bytes32 indexed id,
        string nodeId,
        string operator,
        string reason,
        uint256 ts
    );

    event HumanOverride(
        bytes32 indexed id,
        bytes32 worldIdNullifier,
        string chosenAction,
        uint256 ts
    );

    function commitDecision(
        bytes32 id,
        string calldata nodeId,
        string calldata operator,
        string calldata action,
        string calldata verdict,
        bytes32 zerogRoot
    ) external {
        emit Committed(id, nodeId, operator, action, verdict, zerogRoot, block.timestamp);
    }

    function freezeNode(
        bytes32 id,
        string calldata nodeId,
        string calldata operator,
        string calldata reason
    ) external {
        emit Frozen(id, nodeId, operator, reason, block.timestamp);
    }

    function recordOverride(
        bytes32 id,
        bytes32 worldIdNullifier,
        string calldata chosenAction
    ) external {
        emit HumanOverride(id, worldIdNullifier, chosenAction, block.timestamp);
    }
}
