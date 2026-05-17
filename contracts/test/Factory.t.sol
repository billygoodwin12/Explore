// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Factory} from "../src/Factory.sol";

/// @dev Minimal USDC mock — Factory only reads `IERC20` in commit 2.
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
}

/// @dev Test harness exposing the internal validator so the
///      revert-flavored path is testable before commit 3 wires
///      `createVault`. Mirrors the `CreatorVaultHarness` pattern.
contract FactoryHarness is Factory {
    constructor(
        IERC20 usdc_,
        address coreDepositWallet_,
        address protocolAdmin_,
        bytes32[] memory reservedNameHashes_
    ) Factory(usdc_, coreDepositWallet_, protocolAdmin_, reservedNameHashes_) {}

    function exposed_validateUsernameOrRevert(string calldata u) external view returns (bytes32) {
        return _validateUsernameOrRevert(u);
    }

    function exposed_setUsernameRegistry(bytes32 nameHash, address vault) external {
        _usernameToVaultByHash[nameHash] = vault;
    }
}

contract FactoryTest is Test {
    FactoryHarness factory;
    MockUSDC usdc;

    address admin = address(0xA1);
    address cdw   = address(0xC0);

    function setUp() public {
        usdc = new MockUSDC();
        bytes32[] memory reserved = new bytes32[](3);
        reserved[0] = keccak256(bytes("admin"));
        reserved[1] = keccak256(bytes("theorise"));
        reserved[2] = keccak256(bytes("support"));
        factory = new FactoryHarness(IERC20(address(usdc)), cdw, admin, reserved);
    }

    // ─── Happy-path structural validation ──────────────────────────

    function test_valid_short_username() public view {
        assertTrue(factory.isUsernameAvailable("abc"));
    }

    function test_valid_30_char_max_length() public view {
        // exactly 30 chars
        assertTrue(factory.isUsernameAvailable("a234567890123456789012345678_0"));
    }

    function test_valid_underscore_in_middle() public view {
        assertTrue(factory.isUsernameAvailable("alice_bob"));
    }

    function test_valid_digits_and_letters_mixed() public view {
        assertTrue(factory.isUsernameAvailable("alice_42"));
    }

    function test_valid_all_digits() public view {
        assertTrue(factory.isUsernameAvailable("12345"));
    }

    // ─── Length ─────────────────────────────────────────────────────

    function test_invalid_one_char() public view {
        assertFalse(factory.isUsernameAvailable("a"));
    }

    function test_invalid_two_chars() public view {
        assertFalse(factory.isUsernameAvailable("ab"));
    }

    function test_invalid_31_chars() public view {
        assertFalse(factory.isUsernameAvailable("abcdefghijklmnopqrstuvwxyz12345")); // 31
    }

    function test_invalid_empty_string() public view {
        assertFalse(factory.isUsernameAvailable(""));
    }

    function test_validate_invalid_length_reverts_with_bounds() public {
        vm.expectRevert(
            abi.encodeWithSelector(Factory.UsernameInvalidLength.selector, uint256(2), uint256(3), uint256(30))
        );
        factory.exposed_validateUsernameOrRevert("ab");
    }

    // ─── Character set ──────────────────────────────────────────────

    function test_invalid_uppercase_first_char() public view {
        // Case-insensitivity is enforced by REJECTING uppercase, not
        // by silently lowercasing. UI must lowercase before submission.
        assertFalse(factory.isUsernameAvailable("Alice"));
    }

    function test_invalid_uppercase_in_middle() public view {
        assertFalse(factory.isUsernameAvailable("alIce"));
    }

    function test_invalid_hyphen() public view {
        assertFalse(factory.isUsernameAvailable("ali-ce"));
    }

    function test_invalid_dot() public view {
        assertFalse(factory.isUsernameAvailable("ali.ce"));
    }

    function test_invalid_space() public view {
        assertFalse(factory.isUsernameAvailable("ali ce"));
    }

    function test_invalid_special_chars() public view {
        assertFalse(factory.isUsernameAvailable("alice!"));
        assertFalse(factory.isUsernameAvailable("@alice"));
        assertFalse(factory.isUsernameAvailable("alice#"));
    }

    function test_validate_invalid_char_revert_carries_position() public {
        // "ali.ce" → dot at index 3 → UsernameInvalidCharacter(3).
        vm.expectRevert(
            abi.encodeWithSelector(Factory.UsernameInvalidCharacter.selector, uint256(3))
        );
        factory.exposed_validateUsernameOrRevert("ali.ce");
    }

    // ─── Underscore rules ───────────────────────────────────────────

    function test_invalid_leading_underscore() public view {
        assertFalse(factory.isUsernameAvailable("_alice"));
    }

    function test_invalid_trailing_underscore() public view {
        assertFalse(factory.isUsernameAvailable("alice_"));
    }

    function test_invalid_consecutive_underscore() public view {
        assertFalse(factory.isUsernameAvailable("al__ice"));
    }

    function test_validate_leading_underscore_reverts() public {
        vm.expectRevert(Factory.UsernameLeadingOrTrailingUnderscore.selector);
        factory.exposed_validateUsernameOrRevert("_alice");
    }

    function test_validate_trailing_underscore_reverts() public {
        vm.expectRevert(Factory.UsernameLeadingOrTrailingUnderscore.selector);
        factory.exposed_validateUsernameOrRevert("alice_");
    }

    function test_validate_consec_underscore_revert_carries_position() public {
        // "al__ice" → second underscore at index 3.
        vm.expectRevert(
            abi.encodeWithSelector(Factory.UsernameConsecutiveUnderscore.selector, uint256(3))
        );
        factory.exposed_validateUsernameOrRevert("al__ice");
    }

    // ─── Reserved list ──────────────────────────────────────────────

    function test_reserved_admin_unavailable() public view {
        assertFalse(factory.isUsernameAvailable("admin"));
    }

    function test_reserved_theorise_unavailable() public view {
        assertFalse(factory.isUsernameAvailable("theorise"));
    }

    function test_reserved_support_unavailable() public view {
        assertFalse(factory.isUsernameAvailable("support"));
    }

    function test_validate_reserved_reverts() public {
        vm.expectRevert(Factory.UsernameReserved.selector);
        factory.exposed_validateUsernameOrRevert("admin");
    }

    function test_reserved_case_attack_fails_at_char_check_not_reserved_check() public {
        // "Admin" must fail at the character check (uppercase A), not
        // the reserved check. Confirms the reserved list only matches
        // exact lowercase bytes — the case-attack is blocked one
        // layer earlier by validation.
        vm.expectRevert(
            abi.encodeWithSelector(Factory.UsernameInvalidCharacter.selector, uint256(0))
        );
        factory.exposed_validateUsernameOrRevert("Admin");
    }

    function test_non_reserved_lookalike_still_available() public view {
        // "admin1" isn't reserved; structurally valid; should pass.
        assertTrue(factory.isUsernameAvailable("admin1"));
    }

    // ─── Uniqueness (taken) ─────────────────────────────────────────

    function test_taken_username_unavailable() public {
        // Simulate a prior createVault writing the registry.
        factory.exposed_setUsernameRegistry(keccak256(bytes("alice")), address(0xBEEF));
        assertFalse(factory.isUsernameAvailable("alice"));
    }

    function test_validate_taken_reverts_with_existing_address() public {
        address existing = address(0xBEEF);
        factory.exposed_setUsernameRegistry(keccak256(bytes("alice")), existing);
        vm.expectRevert(
            abi.encodeWithSelector(Factory.UsernameTaken.selector, existing)
        );
        factory.exposed_validateUsernameOrRevert("alice");
    }

    // ─── Lookup view ────────────────────────────────────────────────

    function test_usernameToVault_returns_zero_for_unclaimed() public view {
        assertEq(factory.usernameToVault("nobody"), address(0));
    }

    function test_usernameToVault_returns_zero_for_malformed() public view {
        // Malformed names hash to something that isn't registered; returns address(0).
        // No revert — lookup is pure, validation is separate.
        assertEq(factory.usernameToVault("BAD NAME"), address(0));
    }

    function test_usernameToVault_returns_registered_address() public {
        address vault = address(0xCAFE);
        factory.exposed_setUsernameRegistry(keccak256(bytes("alice")), vault);
        assertEq(factory.usernameToVault("alice"), vault);
    }

    function test_validate_happy_returns_hash() public view {
        bytes32 expected = keccak256(bytes("alice"));
        bytes32 got = factory.exposed_validateUsernameOrRevert("alice");
        assertEq(got, expected);
    }
}
