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
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), "v", "V")
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
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), "v", "V")
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
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), "v", "V")
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
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), "v", "V")
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

    // ─── PR 5 commit 4: getVaults pagination + view surface ──────────

    /// @dev Helper: deploys a vault for `creator` with username `name`,
    ///      pre-mocking the predicted CREATE2 address's precompiles.
    function _deployVaultFor(address creator, string memory name) internal returns (address vault) {
        _seedCreator(creator, 1000e6);

        bytes32 nameHash = keccak256(bytes(name));
        bytes32 salt = keccak256(abi.encodePacked(address(factory), creator, nameHash));
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), creator, admin, address(cdw), address(factory), uint16(100), "v", "V")
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        vm.prank(creator);
        // Cannot vary args at call site here; name is the only var that
        // changes per vault, and _seedCreator uses MIN_INITIAL_STAKE_USDC.
        return _createVaultDynamic(creator, name, 1000e6);
    }

    function _createVaultDynamic(address creator, string memory name, uint256 stake)
        internal returns (address)
    {
        // The Factory.createVault signature takes calldata strings; this
        // helper uses an inline cast via abi.encodeWithSignature so the
        // dynamic memory string is accepted.
        (bool ok, bytes memory ret) = address(factory).call(
            abi.encodeWithSignature(
                "createVault(string,uint256,string,string)",
                name, stake, "v", "V"
            )
        );
        require(ok, "createVault helper call reverted");
        return abi.decode(ret, (address));
    }

    function test_getVaults_empty_when_no_vaults() public view {
        address[] memory page = factory.getVaults(0, 10);
        assertEq(page.length, 0);
    }

    function test_getVaults_limit_zero_returns_empty() public {
        _fundFloat(1e6);
        _deployVaultFor(alice, "alice");
        address[] memory page = factory.getVaults(0, 0);
        assertEq(page.length, 0);
    }

    function test_getVaults_limit_above_max_reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.PaginationLimitTooLarge.selector,
                uint256(101),
                uint256(100)
            )
        );
        factory.getVaults(0, 101);
    }

    function test_getVaults_offset_beyond_count_returns_empty() public {
        _fundFloat(1e6);
        _deployVaultFor(alice, "alice");
        address[] memory page = factory.getVaults(5, 10);
        assertEq(page.length, 0);
    }

    function test_getVaults_multiple_pages() public {
        _fundFloat(5e6);
        // Deploy 5 vaults under 5 different addresses + usernames.
        address[5] memory creators = [
            address(0xA001), address(0xA002), address(0xA003), address(0xA004), address(0xA005)
        ];
        string[5] memory names = ["alice1", "alice2", "alice3", "alice4", "alice5"];
        address[5] memory vaults;
        for (uint256 i = 0; i < 5; i++) {
            vaults[i] = _deployVaultFor(creators[i], names[i]);
        }
        assertEq(factory.vaultCount(), 5);

        address[] memory p1 = factory.getVaults(0, 2);
        assertEq(p1.length, 2);
        assertEq(p1[0], vaults[0]); assertEq(p1[1], vaults[1]);

        address[] memory p2 = factory.getVaults(2, 2);
        assertEq(p2.length, 2);
        assertEq(p2[0], vaults[2]); assertEq(p2[1], vaults[3]);

        // get(4, 2) requests 2 but only 1 remains -- clamp to remaining.
        address[] memory p3 = factory.getVaults(4, 2);
        assertEq(p3.length, 1);
        assertEq(p3[0], vaults[4]);

        // get(5, 2) is beyond the end -- empty.
        address[] memory p4 = factory.getVaults(5, 2);
        assertEq(p4.length, 0);
    }

    function test_getVaults_limit_exceeds_remaining_clamps() public {
        _fundFloat(3e6);
        address[3] memory vaults;
        vaults[0] = _deployVaultFor(address(0xB001), "bob1");
        vaults[1] = _deployVaultFor(address(0xB002), "bob2");
        vaults[2] = _deployVaultFor(address(0xB003), "bob3");

        // Request a page larger than the remainder -- should return
        // vaults[1..3] (2 elements), not revert.
        address[] memory page = factory.getVaults(1, 100);
        assertEq(page.length, 2);
        assertEq(page[0], vaults[1]);
        assertEq(page[1], vaults[2]);
    }

    function test_isCanonicalVault_true_for_deployed_false_for_unknown() public {
        _fundFloat(1e6);
        address vault = _deployVaultFor(alice, "alice");
        assertTrue(factory.isCanonicalVault(vault));
        assertFalse(factory.isCanonicalVault(address(0)));
        assertFalse(factory.isCanonicalVault(address(0xDEAD)));
        assertFalse(factory.isCanonicalVault(address(factory)));
    }

    function test_vaultCount_returns_array_length() public {
        assertEq(factory.vaultCount(), 0);
        _fundFloat(2e6);
        _deployVaultFor(alice, "alice");
        assertEq(factory.vaultCount(), 1);
        _deployVaultFor(bob, "bob_trader");
        assertEq(factory.vaultCount(), 2);
    }

    // ─── PR 5 commit 5: float withdrawal timelock ─────────────────────

    function test_propose_float_withdrawal_succeeds_for_admin() public {
        _fundFloat(10e6);

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.FloatWithdrawalProposed(
            charlie, 5e6, uint64(block.timestamp + 7 days)
        );
        vm.prank(admin);
        factory.proposeFloatWithdrawal(charlie, 5e6);

        (address to, uint256 amount, uint64 executableAt) = factory.pendingFloatWithdrawal();
        assertEq(to, charlie);
        assertEq(amount, 5e6);
        assertEq(executableAt, uint64(block.timestamp + 7 days));
    }

    function test_propose_float_withdrawal_reverts_for_non_admin() public {
        _fundFloat(10e6);
        vm.prank(alice);
        vm.expectRevert(Factory.NotAdmin.selector);
        factory.proposeFloatWithdrawal(charlie, 1e6);
    }

    function test_propose_float_withdrawal_reverts_if_pending_exists() public {
        _fundFloat(10e6);
        vm.prank(admin); factory.proposeFloatWithdrawal(charlie, 1e6);
        (, , uint64 existing) = factory.pendingFloatWithdrawal();

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(Factory.PendingChangeExists.selector, existing)
        );
        factory.proposeFloatWithdrawal(charlie, 2e6);
    }

    function test_propose_float_withdrawal_reverts_if_amount_exceeds_balance() public {
        _fundFloat(10e6);
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.WithdrawalExceedsFloat.selector, uint256(11e6), uint256(10e6)
            )
        );
        factory.proposeFloatWithdrawal(charlie, 11e6);
    }

    function test_propose_float_withdrawal_reverts_if_amount_zero() public {
        _fundFloat(10e6);
        vm.prank(admin);
        vm.expectRevert(Factory.ZeroAmount.selector);
        factory.proposeFloatWithdrawal(charlie, 0);
    }

    function test_propose_float_withdrawal_reverts_if_to_zero_address() public {
        _fundFloat(10e6);
        vm.prank(admin);
        vm.expectRevert(Factory.ZeroAddress.selector);
        factory.proposeFloatWithdrawal(address(0), 1e6);
    }

    function test_execute_float_withdrawal_reverts_before_timelock_elapsed() public {
        _fundFloat(10e6);
        vm.prank(admin); factory.proposeFloatWithdrawal(charlie, 5e6);
        uint64 ea = uint64(block.timestamp + 7 days);

        vm.warp(block.timestamp + 7 days - 1);
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.TimelockNotElapsed.selector, ea, uint64(block.timestamp)
            )
        );
        factory.executeFloatWithdrawal();
    }

    function test_execute_float_withdrawal_succeeds_exactly_at_executable_at() public {
        // Boundary: block.timestamp == executableAt must succeed.
        _fundFloat(10e6);
        vm.prank(admin); factory.proposeFloatWithdrawal(charlie, 5e6);
        (, , uint64 ea) = factory.pendingFloatWithdrawal();

        vm.warp(uint256(ea));
        vm.prank(admin);
        factory.executeFloatWithdrawal();
        assertEq(usdc.balanceOf(charlie), 5e6);
    }

    function test_execute_float_withdrawal_reverts_if_balance_dropped() public {
        _fundFloat(10e6);
        vm.prank(admin); factory.proposeFloatWithdrawal(charlie, 8e6);

        // During the 7-day window, createVault consumes 1 USDC of float.
        // After: floatBalance = 9e6, but withdrawal queued for 8e6 -- still fits.
        // Then a second createVault drops float to 8e6; another to 7e6 -- now < 8e6.
        _deployVaultFor(alice, "alice");
        _deployVaultFor(bob, "bob");
        _deployVaultFor(address(0xD1), "carol");
        assertEq(factory.floatBalance(), 7e6, "float consumed by three vault deploys");

        vm.warp(block.timestamp + 7 days);
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.WithdrawalExceedsFloat.selector, uint256(8e6), uint256(7e6)
            )
        );
        factory.executeFloatWithdrawal();
    }

    function test_execute_float_withdrawal_transfers_usdc_and_decrements_balance() public {
        _fundFloat(10e6);
        vm.prank(admin); factory.proposeFloatWithdrawal(charlie, 6e6);
        vm.warp(block.timestamp + 7 days);

        uint256 charlieBefore = usdc.balanceOf(charlie);
        uint256 factoryBefore = usdc.balanceOf(address(factory));

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.FloatWithdrawalExecuted(charlie, 6e6);
        vm.prank(admin); factory.executeFloatWithdrawal();

        assertEq(usdc.balanceOf(charlie), charlieBefore + 6e6);
        assertEq(usdc.balanceOf(address(factory)), factoryBefore - 6e6);
        assertEq(factory.floatBalance(), 4e6, "floatBalance decremented by withdrawal");

        (, , uint64 ea) = factory.pendingFloatWithdrawal();
        assertEq(ea, 0, "pending cleared after execute");
    }

    function test_execute_float_withdrawal_reverts_no_pending() public {
        vm.prank(admin);
        vm.expectRevert(Factory.NoPendingChange.selector);
        factory.executeFloatWithdrawal();
    }

    function test_cancel_float_withdrawal_clears_pending_and_emits() public {
        _fundFloat(10e6);
        vm.prank(admin); factory.proposeFloatWithdrawal(charlie, 5e6);

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.FloatWithdrawalCancelled(charlie, 5e6);
        vm.prank(admin); factory.cancelPendingFloatWithdrawal();

        (, , uint64 ea) = factory.pendingFloatWithdrawal();
        assertEq(ea, 0);
    }

    function test_cancel_float_withdrawal_reverts_no_pending() public {
        vm.expectRevert(Factory.NoPendingChange.selector);
        factory.cancelPendingFloatWithdrawal();
    }

    function test_cancel_float_withdrawal_is_permissionless() public {
        // Defense against admin-key compromise: if attacker queues
        // a hostile withdrawal, any observer can abort during the
        // 7-day window. Test that a non-admin can cancel.
        _fundFloat(10e6);
        vm.prank(admin); factory.proposeFloatWithdrawal(charlie, 5e6);

        vm.prank(alice); // any random user
        factory.cancelPendingFloatWithdrawal();

        (, , uint64 ea) = factory.pendingFloatWithdrawal();
        assertEq(ea, 0, "alice (non-admin) successfully cancelled");
    }

    function test_propose_cancel_propose_execute_lands_second_withdrawal() public {
        // End-to-end: propose value A, cancel, propose value B, wait,
        // execute. Final transfer matches B; no bleed from A.
        _fundFloat(10e6);
        vm.prank(admin); factory.proposeFloatWithdrawal(charlie, 3e6);
        vm.prank(admin); factory.cancelPendingFloatWithdrawal();

        vm.prank(admin); factory.proposeFloatWithdrawal(charlie, 7e6);
        vm.warp(block.timestamp + 7 days);
        vm.prank(admin); factory.executeFloatWithdrawal();

        assertEq(usdc.balanceOf(charlie), 7e6, "transferred second proposal amount");
        assertEq(factory.floatBalance(), 3e6);
        (address to, uint256 amount, uint64 ea) = factory.pendingFloatWithdrawal();
        assertEq(to, address(0)); assertEq(amount, 0); assertEq(ea, 0);
    }

    // ─── PR 5 commit 6: coverage sweep ────────────────────────────────

    function test_execute_float_withdrawal_reverts_for_non_admin() public {
        // Access-control gap caught in commit 6 audit: execute was
        // tested for happy path + timing reverts but not for caller
        // access. Required: only admin can call execute, even after
        // delay elapses.
        _fundFloat(10e6);
        vm.prank(admin); factory.proposeFloatWithdrawal(charlie, 5e6);
        vm.warp(block.timestamp + 7 days);

        vm.prank(alice);
        vm.expectRevert(Factory.NotAdmin.selector);
        factory.executeFloatWithdrawal();
    }

    function test_createVault_succeeds_at_exactly_min_initial_stake() public {
        // Boundary: stake == MIN_INITIAL_STAKE_USDC ($1000) must
        // succeed; stake one wei below must revert. Bracket the spam
        // guard threshold.
        _fundFloat(1e6);
        _seedCreator(alice, 1000e6);

        bytes32 salt = factory.vaultSalt(alice, "alice");
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), "v", "V")
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        vm.prank(alice);
        address vault = factory.createVault("alice", 1000e6, "v", "V");
        assertEq(vault, predicted, "exact-minimum stake succeeds");
        assertEq(CreatorVault(vault).balanceOf(alice), 1000e6 * 1e6);
    }

    function test_createVault_reverts_one_wei_below_min_initial_stake() public {
        _fundFloat(1e6); _seedCreator(alice, 999_999_999);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.InitialStakeBelowMinimum.selector,
                uint256(999_999_999),
                uint256(1000e6)
            )
        );
        factory.createVault("alice", 999_999_999, "v", "V");
    }

    function test_vaultSalt_is_deterministic_across_calls() public view {
        // Purity check: vaultSalt is a pure hash of (factory, creator,
        // nameHash). Repeated calls with the same args must return
        // identical results -- protects against any future refactor
        // accidentally introducing nondeterminism.
        bytes32 a = factory.vaultSalt(alice, "alice");
        bytes32 b = factory.vaultSalt(alice, "alice");
        bytes32 c = factory.vaultSalt(alice, "alice");
        assertEq(a, b);
        assertEq(b, c);
    }

    function test_vaultSalt_uppercase_differs_from_lowercase() public view {
        // Documents: vaultSalt does NOT lowercase its input. Different
        // case = different hash = different salt. This is fine because
        // createVault validation (commit 2) rejects uppercase at the
        // validator stage, so an uppercase username never reaches the
        // salt computation in practice. But the property is worth
        // asserting so a future refactor that loosens validation
        // doesn't silently introduce a salt-collision attack via
        // case-folding.
        bytes32 lower = factory.vaultSalt(alice, "alice");
        bytes32 upper = factory.vaultSalt(alice, "Alice");
        assertTrue(lower != upper, "uppercase produces distinct salt");
    }

    function test_bootstrap_bypass_does_not_skip_min_deposit_floor() public {
        // _bootstrapped flag bypasses VaultNotActivated only. Other
        // deposit invariants (MIN_DEPOSIT_USDC, TVL cap) must still
        // apply to follower deposits. Test: deploy via factory, then
        // a follower attempting to deposit below MIN_DEPOSIT_USDC
        // must revert DepositBelowMinimum, not silently succeed.
        _fundFloat(1e6);
        address vault = _deployVaultFor(alice, "alice");
        CreatorVault v = CreatorVault(vault);

        usdc.mint(bob, 100e6);
        vm.prank(bob); usdc.approve(vault, type(uint256).max);

        // MIN_DEPOSIT_USDC = 10e6. 9.99 USDC must revert.
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreatorVault.DepositBelowMinimum.selector,
                uint256(9_999_999),
                uint256(10e6)
            )
        );
        v.deposit(9_999_999, bob);
    }

    function test_bootstrap_bypass_does_not_skip_tvl_cap() public {
        // After bootstrap, follower deposits still respect the per-tx
        // TVL cap when the admin re-enables it. Bootstrap doesn't
        // grant a TVL-cap immunity.
        _fundFloat(1e6);
        address vault = _deployVaultFor(alice, "alice");
        CreatorVault v = CreatorVault(vault);

        // Re-enable cap via the timelock (PR 4 propose/execute path).
        // Vault's admin is the factory's PROTOCOL_ADMIN.
        vm.prank(admin); v.proposeTvlCapChange(100); // 1%
        vm.warp(block.timestamp + 24 hours);
        vm.prank(admin); v.executeTvlCapChange();
        assertEq(v.depositTvlCapBps(), 100);

        // Vault NAV = 1000e6 (bootstrap stake, pending-tracked).
        // 1% of NAV = 10e6 = MIN_DEPOSIT_USDC floor.
        // Bob attempting 100e6 (10% of NAV) must revert
        // DepositExceedsTvlCap. Note: per-tx cap reads totalAssets()
        // after _settlePending so pending bootstrap stake is included.
        usdc.mint(bob, 100e6);
        vm.prank(bob); usdc.approve(vault, type(uint256).max);
        vm.prank(bob);
        vm.expectRevert(); // DepositExceedsTvlCap
        v.deposit(100e6, bob);
    }
}
