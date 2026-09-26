// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

/// @notice The part of QuvrRiskOracle this hook needs.
interface IQuvrRiskOracle {
    function isHighRisk(address token, uint256 maxAge) external view returns (bool known, bool high);
}

/**
 * @title QUVR Pulse Risk Hook (Uniswap v4)
 * @notice A "speed bump" for pools that opt in: buying a token that QUVR Risk Oracle currently
 *         labels High requires the swapper to acknowledge the risk (a front-end shows a warning
 *         first and then passes {ACK} as hookData).
 * @dev    Design rules:
 *         - Selling is never restricted: only the token being bought is checked, so nobody can be
 *           trapped in a position.
 *         - No fresh label, an `Insufficient` label or an oracle failure = no restriction (the
 *           hook never bricks a pool because data is missing).
 *         - No owner, no fees, no storage: the rules cannot be changed after deployment.
 */
contract QuvrRiskHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    /// @notice hookData value meaning "I have seen the risk warning and still want to buy".
    bytes32 public constant ACK = keccak256("QUVR_RISK_ACKNOWLEDGED");

    IQuvrRiskOracle public immutable oracle;
    /// @notice Labels older than this (seconds) are ignored.
    uint256 public immutable maxAge;

    event HighRiskBuyAcknowledged(PoolId indexed poolId, address indexed token, address indexed sender);

    error HighRiskNotAcknowledged(address token);

    constructor(IPoolManager manager, IQuvrRiskOracle oracle_, uint256 maxAge_) BaseHook(manager) {
        oracle = oracle_;
        maxAge = maxAge_;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice What the hook would require for buying `token` right now (for front-ends).
    function requiresAcknowledgement(address token) public view returns (bool) {
        if (token == address(0)) return false; // native ETH is never labelled
        try oracle.isHighRisk(token, maxAge) returns (bool known, bool high) {
            return known && high;
        } catch {
            return false;
        }
    }

    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // The token leaving the pool is the one being bought.
        Currency bought = params.zeroForOne ? key.currency1 : key.currency0;
        address token = Currency.unwrap(bought);
        if (requiresAcknowledgement(token)) {
            if (hookData.length < 32 || abi.decode(hookData, (bytes32)) != ACK) {
                revert HighRiskNotAcknowledged(token);
            }
            emit HighRiskBuyAcknowledged(key.toId(), token, sender);
        }
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }
}
