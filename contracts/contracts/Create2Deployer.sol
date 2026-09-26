// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @notice Minimal CREATE2 factory. Uniswap v4 encodes a hook's permissions in the low bits of its
 *         address, so the hook must be deployed at an address mined for those bits.
 */
contract Create2Deployer {
    event Deployed(address indexed addr, bytes32 indexed salt);

    error DeployFailed();

    function deploy(bytes32 salt, bytes calldata initCode) external returns (address addr) {
        bytes memory code = initCode;
        assembly ("memory-safe") {
            addr := create2(0, add(code, 0x20), mload(code), salt)
        }
        if (addr == address(0)) revert DeployFailed();
        emit Deployed(addr, salt);
    }

    function computeAddress(bytes32 salt, bytes32 initCodeHash) external view returns (address) {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash))))
        );
    }
}
