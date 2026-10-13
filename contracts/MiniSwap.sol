// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// Intentionally simple swap between two tokens at a fixed rate set by the owner.
/// Not a real AMM: there is no pricing curve, only a stored rate and a protocol fee.
contract MiniSwap is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;

    /// How many tokenB one tokenA is worth, with 18 decimals (2e18 = 2.0).
    uint256 public rate;

    /// Protocol fee in basis points (30 = 0.3%), deducted from the amount out. It stays in the pool.
    uint256 public feeBps;
    uint256 public constant MAX_FEE_BPS = 1000; // 10%

    event Swapped(
        address indexed trader,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );
    event RateChanged(uint256 rate);
    event FeeChanged(uint256 feeBps);

    error UnsupportedPair();
    error FeeTooHigh(uint256 feeBps);
    error SlippageExceeded(uint256 amountOut, uint256 minAmountOut);

    constructor(IERC20 _tokenA, IERC20 _tokenB, uint256 _rate, uint256 _feeBps) Ownable(msg.sender) {
        tokenA = _tokenA;
        tokenB = _tokenB;
        rate = _rate;
        _setFee(_feeBps);
    }

    function setRate(uint256 newRate) external onlyOwner {
        rate = newRate;
        emit RateChanged(newRate);
    }

    function setFee(uint256 newFeeBps) external onlyOwner {
        _setFee(newFeeBps);
    }

    /// Returns what the trader receives (after the fee) and the fee itself, both in tokenOut.
    function quote(address tokenIn, address tokenOut, uint256 amountIn)
        public
        view
        returns (uint256 amountOut, uint256 fee)
    {
        uint256 grossAmountOut;
        if (tokenIn == address(tokenA) && tokenOut == address(tokenB)) {
            grossAmountOut = (amountIn * rate) / 1e18;
        } else if (tokenIn == address(tokenB) && tokenOut == address(tokenA)) {
            grossAmountOut = (amountIn * 1e18) / rate;
        } else {
            revert UnsupportedPair();
        }
        fee = (grossAmountOut * feeBps) / 10_000;
        amountOut = grossAmountOut - fee;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)
        external
        returns (uint256 amountOut)
    {
        uint256 fee;
        (amountOut, fee) = quote(tokenIn, tokenOut, amountIn);
        // Slippage protection: the rate may have changed since the user got a quote.
        if (amountOut < minAmountOut) {
            revert SlippageExceeded(amountOut, minAmountOut);
        }

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit Swapped(msg.sender, tokenIn, tokenOut, amountIn, amountOut, fee);
    }

    function _setFee(uint256 newFeeBps) private {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps);
        feeBps = newFeeBps;
        emit FeeChanged(newFeeBps);
    }
}
