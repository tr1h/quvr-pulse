// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title QUVR Pulse Risk Oracle
 * @notice Read-only risk labels for tokens, published by QUVR Pulse (https://quvrpulse.com).
 *         Any contract or app can read a token's latest label; every update is also emitted as
 *         an event, so the full history stays verifiable on-chain. The first time a token is
 *         labelled — and the first time it is labelled High — are stored permanently: proof that
 *         a warning existed before whatever happened next.
 * @dev    A label describes detected risk signs at `updatedAt`. It is never a statement that a
 *         token is "safe", and it is not investment advice. Integrators should always check
 *         freshness (see {isHighRisk}) and treat `Level.None` as "no data", not as low risk.
 */
contract QuvrRiskOracle is Ownable2Step {
    string public constant VERSION = "2";

    /// @notice Overall label. `None` = never assessed. `Insufficient` = assessed without enough data.
    enum Level {
        None,
        Low,
        Elevated,
        High,
        Insufficient
    }

    /// @notice Score value meaning "no data" (scores are 0–100 otherwise; missing data is never 0).
    uint8 public constant NO_DATA = 255;

    /// @notice Red-flag bits (see {flags} in {Assessment}).
    uint32 public constant FLAG_CONTRACT_CONTROL = 1 << 0; // owner can still mint/pause/blacklist/upgrade
    uint32 public constant FLAG_CONCENTRATED = 1 << 1; // top holders own most of the supply
    uint32 public constant FLAG_DEPLOYER_SHARE = 1 << 2; // creator holds a large share
    uint32 public constant FLAG_DEPLOYER_SELLING = 1 << 3; // creator is selling
    uint32 public constant FLAG_CLUSTERS = 1 << 4; // possibly related wallets hold a notable share
    uint32 public constant FLAG_THIN_LIQUIDITY = 1 << 5;
    uint32 public constant FLAG_PRICE_IMPACT = 1 << 6; // a small sell moves the price a lot
    uint32 public constant FLAG_MASS_TRANSFERS = 1 << 7;
    uint32 public constant KNOWN_FLAGS = (1 << 8) - 1;

    /// @notice Maximum length of a project response, in bytes (a post-sized note).
    uint256 public constant MAX_RESPONSE_BYTES = 280;

    /// @dev One storage slot (8+8+8+8+32+40+40+40+32 = 216 bits) plus the report id.
    struct Assessment {
        Level level;
        uint8 contractScore;
        uint8 liquidityScore;
        uint8 distributionScore;
        uint32 flags;
        uint40 updatedAt;
        /// @notice When the token was labelled for the first time (never overwritten).
        uint40 firstLabeledAt;
        /// @notice When the token was first labelled High; 0 if never (never overwritten).
        uint40 firstHighAt;
        /// @notice How many labels have been published for the token.
        uint32 labelCount;
        /// @notice Id of the report version the label came from (see QUVR Pulse docs).
        bytes32 reportHash;
    }

    /// @notice Input for {publish}/{publishBatch}; timestamps and counters are set by the contract.
    struct Label {
        Level level;
        uint8 contractScore;
        uint8 liquidityScore;
        uint8 distributionScore;
        uint32 flags;
        bytes32 reportHash;
    }

    mapping(address token => Assessment) private _assessments;
    mapping(address account => bool) public isPublisher;

    event PublisherSet(address indexed account, bool allowed);
    event AssessmentPublished(
        address indexed token,
        Level level,
        uint8 contractScore,
        uint8 liquidityScore,
        uint8 distributionScore,
        uint32 flags,
        bytes32 reportHash
    );
    /// @notice A public reply to a label, e.g. from the token's team. Stored only as an event.
    event ProjectResponse(address indexed token, address indexed responder, string message);

    error NotPublisher(address account);
    error InvalidAddress();
    error RenounceDisabled();
    error InvalidLevel();
    error InvalidScore(uint8 score);
    error UnknownFlags(uint32 flags);
    error LengthMismatch(uint256 tokens, uint256 labels);
    error NotAssessed(address token);
    error InvalidResponse(uint256 length);

    modifier onlyPublisher() {
        if (!isPublisher[msg.sender]) revert NotPublisher(msg.sender);
        _;
    }

    constructor(address initialOwner, address initialPublisher) Ownable(initialOwner) {
        _setPublisher(initialPublisher, true);
    }

    // ------------------------------------------------------------------ admin

    /// @notice Grants or revokes the right to publish labels.
    function setPublisher(address account, bool allowed) external onlyOwner {
        _setPublisher(account, allowed);
    }

    /// @notice Disabled: without an owner a compromised publisher could never be revoked.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ------------------------------------------------------------------ publishing

    function publish(address token, Label calldata label) external onlyPublisher {
        _publish(token, label);
    }

    /// @notice Publishes many labels in one transaction (cheaper per token).
    function publishBatch(address[] calldata tokens, Label[] calldata labels) external onlyPublisher {
        if (tokens.length != labels.length) revert LengthMismatch(tokens.length, labels.length);
        for (uint256 i = 0; i < tokens.length; ++i) {
            _publish(tokens[i], labels[i]);
        }
    }

    // ------------------------------------------------------------------ responses

    /**
     * @notice Posts a public reply to a token's label (for example, the team explaining a flag).
     *         Anyone can respond; readers see the sender address and decide whom to trust —
     *         QUVR Pulse marks replies coming from the token's creator.
     */
    function respond(address token, string calldata message) external {
        if (_assessments[token].labelCount == 0) revert NotAssessed(token);
        uint256 len = bytes(message).length;
        if (len == 0 || len > MAX_RESPONSE_BYTES) revert InvalidResponse(len);
        emit ProjectResponse(token, msg.sender, message);
    }

    // ------------------------------------------------------------------ reading

    /// @notice Latest label for `token` (all zeros / `Level.None` if never assessed).
    function getAssessment(address token) external view returns (Assessment memory) {
        return _assessments[token];
    }

    /// @notice Latest labels for many tokens in one call (same order as `tokens`).
    function getAssessments(address[] calldata tokens) external view returns (Assessment[] memory out) {
        out = new Assessment[](tokens.length);
        for (uint256 i = 0; i < tokens.length; ++i) {
            out[i] = _assessments[tokens[i]];
        }
    }

    /**
     * @notice Convenience check for integrators (launchpads, DEX front-ends, wallets, hooks).
     * @param maxAge Maximum label age in seconds; older labels count as unknown.
     * @return known True when a label exists, is not `Insufficient`, and is fresh enough.
     * @return high  True when that label is `High`.
     */
    function isHighRisk(address token, uint256 maxAge) external view returns (bool known, bool high) {
        Assessment storage a = _assessments[token];
        if (a.level == Level.None || a.level == Level.Insufficient) return (false, false);
        if (block.timestamp - a.updatedAt > maxAge) return (false, false);
        return (true, a.level == Level.High);
    }

    // ------------------------------------------------------------------ internal

    function _setPublisher(address account, bool allowed) private {
        if (account == address(0)) revert InvalidAddress();
        isPublisher[account] = allowed;
        emit PublisherSet(account, allowed);
    }

    function _publish(address token, Label calldata l) private {
        if (token == address(0)) revert InvalidAddress();
        if (l.level == Level.None) revert InvalidLevel();
        _checkScore(l.contractScore);
        _checkScore(l.liquidityScore);
        _checkScore(l.distributionScore);
        if (l.flags & ~KNOWN_FLAGS != 0) revert UnknownFlags(l.flags);

        Assessment storage a = _assessments[token];
        uint40 now_ = uint40(block.timestamp);
        if (a.labelCount == 0) a.firstLabeledAt = now_;
        if (l.level == Level.High && a.firstHighAt == 0) a.firstHighAt = now_;
        a.level = l.level;
        a.contractScore = l.contractScore;
        a.liquidityScore = l.liquidityScore;
        a.distributionScore = l.distributionScore;
        a.flags = l.flags;
        a.updatedAt = now_;
        a.labelCount += 1;
        a.reportHash = l.reportHash;

        emit AssessmentPublished(
            token,
            l.level,
            l.contractScore,
            l.liquidityScore,
            l.distributionScore,
            l.flags,
            l.reportHash
        );
    }

    function _checkScore(uint8 s) private pure {
        if (s > 100 && s != NO_DATA) revert InvalidScore(s);
    }
}
