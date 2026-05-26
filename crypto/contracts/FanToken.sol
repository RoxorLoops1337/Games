// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// Fungible reward token. Owner mints to fans; total supply is capped so scarcity is enforceable.
contract FanToken is ERC20, ERC20Burnable, ERC20Permit, Ownable {
    uint256 public immutable maxSupply;

    error MaxSupplyExceeded(uint256 attempted, uint256 cap);
    error ArrayLengthMismatch();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        address initialOwner
    ) ERC20(name_, symbol_) ERC20Permit(name_) Ownable(initialOwner) {
        maxSupply = maxSupply_;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        if (totalSupply() + amount > maxSupply) {
            revert MaxSupplyExceeded(totalSupply() + amount, maxSupply);
        }
        _mint(to, amount);
    }

    /// Reward many fans in a single transaction. Cheaper gas than calling mint() in a loop off-chain.
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();
        uint256 total;
        for (uint256 i; i < amounts.length; ++i) {
            total += amounts[i];
        }
        if (totalSupply() + total > maxSupply) {
            revert MaxSupplyExceeded(totalSupply() + total, maxSupply);
        }
        for (uint256 i; i < recipients.length; ++i) {
            _mint(recipients[i], amounts[i]);
        }
    }
}
