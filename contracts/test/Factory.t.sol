// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Factory} from "../src/Factory.sol";
import {CreatorVault} from "../src/CreatorVault.sol";
import {HLConstants} from "../src/HLConstants.sol";

/// @dev USDC mock supporting the full ERC-20 surface CreatorVault and
///      Factory exercise. Used by createVault tests in commit 3b.
contract MockUSDC {
    string  public name     = "USD Coin";
    string  public symbol   = "USDC";
    uint8   public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: transfer amount exceeds balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: transfer amount exceeds balance");
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= amount, "ERC20: insufficient allowance");
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Minimal CDW mock that absorbs USDC via transferFrom, mirroring
///      what the real CDW does. Does NOT credit Core spot — tests mock
///      the spot precompile directly via vm.mockCall.
contract MockCoreDepositWallet {
    IERC20 public immutable usdc;
    constructor(address usdcAddr) { usdc = IERC20(usdcAddr); }

    function depositFor(address /*recipient*/, uint256 amount, uint32 /*destDex*/) external {
        usdc.transferFrom(msg.sender, address(this), amount);
    }
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
    MockCoreDepositWallet cdw;

    address admin   = address(0xA1);
    address alice   = address(0xA2);
    address bob     = address(0xB0);
    address charlie = address(0xC1);

    function setUp() public {
        usdc = new MockUSDC();
        cdw  = new MockCoreDepositWallet(address(usdc));
        bytes32[] memory reserved = new bytes32[](3);
        reserved[0] = keccak256(bytes("admin"));
        reserved[1] = keccak256(bytes("theorise"));
        reserved[2] = keccak256(bytes("support"));
        factory = new FactoryHarness(IERC20(address(usdc)), address(cdw), admin, reserved);

        // Mock the CoreWriter precompile so vault's bootstrapDeposit
        // path -> _updateStakeBreachState -> any indirect CoreWriter
        // touchpoints don't revert. (bootstrapDeposit doesn't fire
        // CoreWriter actions itself, but defensive for downstream calls.)
        vm.mockCall(HLConstants.CORE_WRITER, bytes(""), bytes(""));
    }

    /// @dev Per the case-(b) probe (INVESTIGATION sec 15.2): inside the
    ///      same tx as createVault, the vault's spot precompile reads 0.
    ///      Mock it explicitly so totalAssets() inside bootstrapDeposit's
    ///      _updateStakeBreachState behaves correctly.
    function _mockVaultCorePrecompiles(address vault, uint256 spotSixDec) internal {
        vm.mockCall(
            HLConstants.SPOT_BALANCE_PRECOMPILE,
            abi.encode(vault, HLConstants.USDC_SPOT_INDEX),
            abi.encode(uint64(spotSixDec * 100), uint64(0), uint64(0))
        );
        vm.mockCall(
            HLConstants.ACCOUNT_MARGIN_SUMMARY_PRECOMPILE,
            abi.encode(uint32(0), vault),
            abi.encode(int64(0), uint64(0), uint64(0), int64(0))
        );
    }

    function _fundFloat(uint256 amount) internal {
        usdc.mint(admin, amount);
        vm.prank(admin); usdc.approve(address(factory), amount);
        vm.prank(admin); factory.treasuryFundFloat(amount);
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

    // ─── PR 5 commit 3b: createVault end-to-end ───────────────────────

    function _seedCreator(address creator, uint256 amount) internal {
        usdc.mint(creator, amount);
        vm.prank(creator); usdc.approve(address(factory), amount);
    }

    function test_createVault_happy_path_atomic() public {
        _fundFloat(1e6);
        uint256 stake = 1000e6;
        _seedCreator(alice, stake);

        // Pre-mock the precompiles for the predicted vault address.
        bytes32 salt = factory.vaultSalt(alice, "alice");
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), "v", "V")
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        vm.prank(alice);
        address vault = factory.createVault("alice", stake, "v", "V");

        assertEq(vault, predicted, "CREATE2 address matches off-chain prediction");
        assertEq(factory.usernameToVault("alice"), vault);
        assertEq(factory.creatorToVault(alice), vault);
        assertTrue(factory.isCanonicalVault(vault));
        assertEq(factory.usernameDisplay(vault), "alice");
        assertEq(factory.vaultCount(), 1);

        // Vault state.
        CreatorVault v = CreatorVault(vault);
        assertEq(v.CREATOR(), alice);
        assertEq(v.FACTORY(), address(factory));
        assertEq(v.balanceOf(alice), stake * 1e6, "creator gets net stake worth of shares");
        assertEq(v.pendingBridgedUsdc(), stake, "tracker enqueued the NET stake, not gross");
        assertEq(v.totalAssets(), stake, "totalAssets reflects pending-only NAV pre-settle");

        // Float decremented by exactly the activation fee.
        assertEq(factory.floatBalance(), 0, "1 USDC fee absorbed");

        // CDW received gross (fee + stake).
        assertEq(usdc.balanceOf(address(cdw)), 1e6 + stake);
        // Factory holds no leftover USDC.
        assertEq(usdc.balanceOf(address(factory)), 0);
        // Creator's EVM USDC fully transferred to factory then bridged out.
        assertEq(usdc.balanceOf(alice), 0);
    }

    function test_createVault_reverts_username_reserved() public {
        _fundFloat(1e6); _seedCreator(alice, 1000e6);
        vm.prank(alice);
        vm.expectRevert(Factory.UsernameReserved.selector);
        factory.createVault("admin", 1000e6, "v", "V");
    }

    function test_createVault_reverts_username_invalid() public {
        _fundFloat(1e6); _seedCreator(alice, 1000e6);
        vm.prank(alice);
        vm.expectRevert(); // length / charset / underscore -- specific selector covered by commit 2 tests
        factory.createVault("Alice", 1000e6, "v", "V");
    }

    function test_createVault_reverts_username_taken() public {
        _fundFloat(2e6);
        _seedCreator(alice, 1000e6);
        _seedCreator(bob, 1000e6);

        // First creator takes "trader". Mock the precompiles for both predicted vaults.
        bytes32 salt1 = factory.vaultSalt(alice, "trader");
        bytes32 initHash1 = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), "v", "V")
        ));
        address predicted1 = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt1, initHash1
        )))));
        _mockVaultCorePrecompiles(predicted1, 0);

        vm.prank(alice); factory.createVault("trader", 1000e6, "v", "V");

        // Bob tries to claim the same username.
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(Factory.UsernameTaken.selector, predicted1)
        );
        factory.createVault("trader", 1000e6, "v", "V");
    }

    function test_createVault_reverts_creator_already_has_vault() public {
        _fundFloat(2e6);
        _seedCreator(alice, 2000e6);

        bytes32 salt = factory.vaultSalt(alice, "alice");
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), "v", "V")
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        vm.prank(alice); address vault = factory.createVault("alice", 1000e6, "v", "V");

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Factory.CreatorAlreadyHasVault.selector, vault)
        );
        factory.createVault("alice2", 1000e6, "v", "V");
    }

    function test_createVault_reverts_stake_below_minimum() public {
        _fundFloat(1e6); _seedCreator(alice, 999e6);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.InitialStakeBelowMinimum.selector, uint256(999e6), uint256(1000e6)
            )
        );
        factory.createVault("alice", 999e6, "v", "V");
    }

    function test_createVault_reverts_float_exhausted() public {
        _seedCreator(alice, 1000e6);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Factory.FloatExhausted.selector, uint256(0), uint256(1e6))
        );
        factory.createVault("alice", 1000e6, "v", "V");
    }

    function test_createVault_emits_VaultDeployed_and_UsernameClaimed() public {
        _fundFloat(1e6); _seedCreator(alice, 1000e6);

        bytes32 salt = factory.vaultSalt(alice, "alice");
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), "v", "V")
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        vm.recordLogs();
        vm.prank(alice);
        factory.createVault("alice", 1000e6, "v", "V");
        Vm.Log[] memory entries = vm.getRecordedLogs();

        bytes32 vaultDeployedTopic = keccak256("VaultDeployed(address,address,string,uint256,uint256,uint256,uint256)");
        bytes32 usernameClaimedTopic = keccak256("UsernameClaimed(string,address)");

        bool sawDeployed; bool sawClaimed;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics[0] == vaultDeployedTopic) sawDeployed = true;
            if (entries[i].topics[0] == usernameClaimedTopic) sawClaimed = true;
        }
        assertTrue(sawDeployed, "VaultDeployed not emitted");
        assertTrue(sawClaimed, "UsernameClaimed not emitted");
    }

    function test_treasuryFundFloat_increments_balance() public {
        usdc.mint(admin, 5e6);
        vm.prank(admin); usdc.approve(address(factory), 5e6);
        vm.prank(admin); factory.treasuryFundFloat(5e6);
        assertEq(factory.floatBalance(), 5e6);
        assertEq(usdc.balanceOf(address(factory)), 5e6);
    }

    function test_treasuryFundFloat_reverts_zero() public {
        vm.prank(admin);
        vm.expectRevert(Factory.ZeroAmount.selector);
        factory.treasuryFundFloat(0);
    }

    function test_treasuryFundFloat_reverts_non_admin() public {
        vm.prank(alice);
        vm.expectRevert(Factory.NotAdmin.selector);
        factory.treasuryFundFloat(1e6);
    }

    function test_vaultSalt_matches_canonical_formula() public view {
        bytes32 expected = keccak256(abi.encodePacked(
            address(factory), alice, keccak256(bytes("alice"))
        ));
        assertEq(factory.vaultSalt(alice, "alice"), expected);
    }
}
