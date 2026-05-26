// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// Tiered membership NFT. Owner can mint for free (rewards). Anyone can buy at a public price.
/// tokenURI -> baseURI + tokenId + ".json". Host metadata on IPFS or a static endpoint.
contract FanNFT is ERC721Enumerable, Ownable {
    uint256 public maxSupply;
    uint256 public publicPrice;
    bool public publicMintOpen;
    string private _baseTokenURI;
    uint256 private _nextId = 1;

    event PublicMintToggled(bool open);
    event PriceUpdated(uint256 newPrice);
    event BaseURIUpdated(string newBaseURI);
    event Withdrawn(address indexed to, uint256 amount);

    error MaxSupplyReached();
    error PublicMintClosed();
    error InsufficientPayment(uint256 sent, uint256 required);
    error WithdrawFailed();
    error ArrayLengthMismatch();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI_,
        uint256 maxSupply_,
        uint256 publicPrice_,
        address initialOwner
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        _baseTokenURI = baseURI_;
        maxSupply = maxSupply_;
        publicPrice = publicPrice_;
    }

    /// Free mint to a fan (you pay the gas).
    function ownerMint(address to) external onlyOwner returns (uint256 tokenId) {
        if (_nextId > maxSupply) revert MaxSupplyReached();
        tokenId = _nextId++;
        _safeMint(to, tokenId);
    }

    /// Free mint to many fans in one tx.
    function ownerBatchMint(address[] calldata recipients) external onlyOwner {
        uint256 n = recipients.length;
        for (uint256 i; i < n; ++i) {
            if (_nextId > maxSupply) revert MaxSupplyReached();
            uint256 tokenId = _nextId++;
            _safeMint(recipients[i], tokenId);
        }
    }

    /// Public sale. Caller pays publicPrice per token in ETH.
    function publicMint(uint256 quantity) external payable {
        if (!publicMintOpen) revert PublicMintClosed();
        uint256 cost = publicPrice * quantity;
        if (msg.value < cost) revert InsufficientPayment(msg.value, cost);
        for (uint256 i; i < quantity; ++i) {
            if (_nextId > maxSupply) revert MaxSupplyReached();
            uint256 tokenId = _nextId++;
            _safeMint(msg.sender, tokenId);
        }
    }

    function setPublicMintOpen(bool open) external onlyOwner {
        publicMintOpen = open;
        emit PublicMintToggled(open);
    }

    function setPublicPrice(uint256 newPrice) external onlyOwner {
        publicPrice = newPrice;
        emit PriceUpdated(newPrice);
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function withdraw(address payable to) external onlyOwner {
        uint256 amount = address(this).balance;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(to, amount);
    }

    /// Bronze (1-999), Silver (1000-4999), Gold (5000+). Adjust ranges to taste.
    function tierOf(uint256 tokenId) external pure returns (string memory) {
        if (tokenId < 1000) return "Bronze";
        if (tokenId < 5000) return "Silver";
        return "Gold";
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
