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
        address protocolTreasury_,
        uint256 initialDeploymentFeeUsdc_,
        bytes32[] memory reservedNameHashes_
    ) Factory(
        usdc_, coreDepositWallet_, protocolAdmin_,
        protocolTreasury_, initialDeploymentFeeUsdc_, reservedNameHashes_
    ) {}

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

    address admin    = address(0xA1);
    address alice    = address(0xA2);
    address bob      = address(0xB0);
    address charlie  = address(0xC1);
    address treasury = address(0xFEE);
    uint256 constant INITIAL_DEPLOYMENT_FEE = 20e6; // $20

    function setUp() public {
        usdc = new MockUSDC();
        cdw  = new MockCoreDepositWallet(address(usdc));
        bytes32[] memory reserved = new bytes32[](3);
        reserved[0] = keccak256(bytes("admin"));
        reserved[1] = keccak256(bytes("theorise"));
        reserved[2] = keccak256(bytes("support"));
        factory = new FactoryHarness(
            IERC20(address(usdc)), address(cdw), admin,
            treasury, INITIAL_DEPLOYMENT_FEE, reserved
        );

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

    /// @dev `amount` is the intended STAKE. PR 6c: factory pulls
    ///      `deploymentFeeUsdc + stake` from the creator, so the seed
    ///      must cover both. Helper reads current factory state so
    ///      tests that change the deployment fee mid-suite still
    ///      seed correctly.
    function _seedCreator(address creator, uint256 amount) internal {
        uint256 total = amount + factory.deploymentFeeUsdc();
        usdc.mint(creator, total);
        vm.prank(creator); usdc.approve(address(factory), total);
    }

    function test_createVault_happy_path_atomic() public {
        _fundFloat(1e6);
        uint256 stake = 1000e6;
        _seedCreator(alice, stake);

        // Pre-mock the precompiles for the predicted vault address.
        bytes32 salt = factory.vaultSalt(alice, "alice");
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), uint16(25), address(0), uint64(0), "v", "V")
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
        // Factory holds no leftover USDC (deploymentFee forwarded to treasury;
        // stake + activation fee bridged to CDW).
        assertEq(usdc.balanceOf(address(factory)), 0);
        // Creator's EVM USDC fully transferred to factory.
        assertEq(usdc.balanceOf(alice), 0);
        // PR 6c: treasury received the deployment fee.
        assertEq(usdc.balanceOf(treasury), INITIAL_DEPLOYMENT_FEE);
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
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), uint16(25), address(0), uint64(0), "v", "V")
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
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), uint16(25), address(0), uint64(0), "v", "V")
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
        // PR 6e: minimum is now $100 (state). Try $50 (50e6) -- below.
        _fundFloat(1e6); _seedCreator(alice, 50e6);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.InitialStakeBelowMinimum.selector, uint256(50e6), uint256(100e6)
            )
        );
        factory.createVault("alice", 50e6, "v", "V");
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
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), uint16(25), address(0), uint64(0), "v", "V")
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
            abi.encode(IERC20(address(usdc)), creator, admin, address(cdw), address(factory), uint16(100), uint16(25), address(0), uint64(0), "v", "V")
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        vm.prank(creator);
        // Cannot vary args at call site here; name is the only var that
        // changes per vault, and _seedCreator uses minInitialStakeUsdc.
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
        // Boundary: stake == minInitialStakeUsdc (PR 6e: $100) must
        // succeed; stake one wei below must revert. Bracket the spam
        // guard threshold.
        _fundFloat(1e6);
        _seedCreator(alice, 100e6);

        bytes32 salt = factory.vaultSalt(alice, "alice");
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), uint16(25), address(0), uint64(0), "v", "V")
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        vm.prank(alice);
        address vault = factory.createVault("alice", 100e6, "v", "V");
        assertEq(vault, predicted, "exact-minimum stake succeeds");
        assertEq(CreatorVault(vault).balanceOf(alice), 100e6 * 1e6);
    }

    function test_createVault_reverts_one_wei_below_min_initial_stake() public {
        // PR 6e: 99_999_999 = 100e6 - 1.
        _fundFloat(1e6); _seedCreator(alice, 99_999_999);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.InitialStakeBelowMinimum.selector,
                uint256(99_999_999),
                uint256(100e6)
            )
        );
        factory.createVault("alice", 99_999_999, "v", "V");
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

    // ─── PR 6c: deployment fee + treasury management ──────────────────

    function test_createVault_charges_deployment_fee() public {
        _fundFloat(1e6);
        uint256 stake = 1000e6;
        _seedCreator(alice, stake); // seeds stake + deploymentFee

        bytes32 salt = factory.vaultSalt(alice, "alice");
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), uint16(25), address(0), uint64(0), "v", "V")
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(alice);
        factory.createVault("alice", stake, "v", "V");
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, INITIAL_DEPLOYMENT_FEE);
    }

    function test_createVault_insufficient_approval_reverts() public {
        _fundFloat(1e6);
        usdc.mint(alice, 1000e6);
        // Approve only the stake; not enough to cover stake + deploymentFee.
        vm.prank(alice); usdc.approve(address(factory), 1000e6);
        vm.prank(alice);
        vm.expectRevert(); // SafeERC20 / allowance revert
        factory.createVault("alice", 1000e6, "v", "V");
    }

    function test_createVault_zero_deployment_fee() public {
        // Admin proposes deploymentFee = 0 and executes after 24h.
        vm.prank(admin); factory.proposeDeploymentFee(0);
        vm.warp(block.timestamp + 24 hours);
        vm.prank(admin); factory.executeDeploymentFee();
        assertEq(factory.deploymentFeeUsdc(), 0);

        _fundFloat(1e6);
        uint256 stake = 1000e6;
        _seedCreator(alice, stake); // seeds stake (deploymentFee now 0)

        bytes32 salt = factory.vaultSalt(alice, "alice");
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), uint16(25), address(0), uint64(0), "v", "V")
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(alice);
        factory.createVault("alice", stake, "v", "V");

        // Treasury unchanged; no fee event expected.
        assertEq(usdc.balanceOf(treasury), treasuryBefore);
    }

    function test_admin_propose_deployment_fee_change() public {
        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.DeploymentFeeChangeProposed(
            25e6, uint64(block.timestamp + 24 hours)
        );
        vm.prank(admin); factory.proposeDeploymentFee(25e6);

        (uint256 newFee, uint64 ea) = factory.pendingDeploymentFee();
        assertEq(newFee, 25e6);
        assertEq(ea, uint64(block.timestamp + 24 hours));
    }

    function test_deployment_fee_executes_after_timelock() public {
        vm.prank(admin); factory.proposeDeploymentFee(25e6);
        (, uint64 ea) = factory.pendingDeploymentFee();

        vm.warp(uint256(ea));
        vm.prank(admin); factory.executeDeploymentFee();
        assertEq(factory.deploymentFeeUsdc(), 25e6);
        // Pending cleared.
        (uint256 newFee, uint64 eaAfter) = factory.pendingDeploymentFee();
        assertEq(newFee, 0); assertEq(eaAfter, 0);
    }

    function test_deployment_fee_change_propagates_to_subsequent_deploys() public {
        vm.prank(admin); factory.proposeDeploymentFee(50e6);
        vm.warp(block.timestamp + 24 hours);
        vm.prank(admin); factory.executeDeploymentFee();

        _fundFloat(1e6);
        uint256 stake = 1000e6;
        _seedCreator(alice, stake); // seeds stake + new 50e6 fee

        bytes32 salt = factory.vaultSalt(alice, "alice");
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), uint16(25), address(0), uint64(0), "v", "V")
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(alice);
        factory.createVault("alice", stake, "v", "V");
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 50e6);
    }

    function test_cancel_pending_deployment_fee_permissionless() public {
        vm.prank(admin); factory.proposeDeploymentFee(50e6);

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.DeploymentFeeChangeCancelled(50e6);
        vm.prank(alice); // permissionless
        factory.cancelPendingDeploymentFee();

        (uint256 newFee, uint64 ea) = factory.pendingDeploymentFee();
        assertEq(newFee, 0); assertEq(ea, 0);
    }

    function test_treasury_change_propose_execute_with_7d_timelock() public {
        address newTreasury = address(0xBEEF);

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.TreasuryChangeProposed(
            newTreasury, uint64(block.timestamp + 7 days)
        );
        vm.prank(admin); factory.proposeTreasuryChange(newTreasury);

        // Cannot execute before 7 days.
        vm.warp(block.timestamp + 7 days - 1);
        vm.prank(admin);
        vm.expectRevert();
        factory.executeTreasuryChange();

        // Execute at exactly 7 days.
        vm.warp(block.timestamp + 1);
        vm.prank(admin); factory.executeTreasuryChange();
        assertEq(factory.protocolTreasury(), newTreasury);
    }

    function test_treasury_change_blocks_at_24h() public {
        // Treasury is 7-day timelock (TREASURY_CHANGE_DELAY), NOT 24h
        // like the fee tiers. This test asserts execute at 24h reverts.
        vm.prank(admin); factory.proposeTreasuryChange(address(0xBEEF));

        vm.warp(block.timestamp + 24 hours);
        vm.prank(admin);
        vm.expectRevert();
        factory.executeTreasuryChange();
    }

    function test_treasury_receives_deployment_fee_after_change() public {
        // Propose + execute treasury change; subsequent createVault
        // routes deployment fee to the new treasury.
        address newTreasury = address(0xBEEF);
        vm.prank(admin); factory.proposeTreasuryChange(newTreasury);
        vm.warp(block.timestamp + 7 days);
        vm.prank(admin); factory.executeTreasuryChange();

        _fundFloat(1e6);
        uint256 stake = 1000e6;
        _seedCreator(alice, stake);

        bytes32 salt = factory.vaultSalt(alice, "alice");
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(IERC20(address(usdc)), alice, admin, address(cdw), address(factory), uint16(100), uint16(25), address(0), uint64(0), "v", "V")
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        uint256 oldTreasuryBefore = usdc.balanceOf(treasury);
        uint256 newTreasuryBefore = usdc.balanceOf(newTreasury);
        vm.prank(alice);
        factory.createVault("alice", stake, "v", "V");

        assertEq(usdc.balanceOf(treasury), oldTreasuryBefore, "old treasury unchanged");
        assertEq(
            usdc.balanceOf(newTreasury) - newTreasuryBefore,
            INITIAL_DEPLOYMENT_FEE,
            "new treasury received the deployment fee"
        );
    }

    function test_cancel_pending_treasury_change_permissionless() public {
        address newTreasury = address(0xBEEF);
        vm.prank(admin); factory.proposeTreasuryChange(newTreasury);

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.TreasuryChangeCancelled(newTreasury);
        vm.prank(alice); // permissionless
        factory.cancelPendingTreasuryChange();

        (address t, uint64 ea) = factory.pendingTreasuryChange();
        assertEq(t, address(0)); assertEq(ea, 0);
    }

    // ─── PR 6b: factory-level deposit fee default + cap ──────────────

    /// @dev Builds a vault via factory.createVault for the given creator
    ///      with username "alice"-style. Returns the deployed address.
    ///      Uses the current factory state (defaultDepositFeeBps,
    ///      currentDepositFeeCapBps) for the CREATE2 init-code hash.
    function _deployVaultWithCurrentDefaults(
        address creator,
        string memory name
    ) internal returns (address vault) {
        _seedCreator(creator, 1000e6);

        bytes32 nameHash = keccak256(bytes(name));
        bytes32 salt = keccak256(abi.encodePacked(address(factory), creator, nameHash));
        uint16 cap = factory.currentDepositFeeCapBps();
        uint16 def = factory.defaultDepositFeeBps();
        address builderAddr = factory.defaultBuilderAddress();
        uint64 builderRate  = factory.defaultBuilderFeeRate();
        bytes32 initHash = keccak256(abi.encodePacked(
            type(CreatorVault).creationCode,
            abi.encode(
                IERC20(address(usdc)), creator, admin, address(cdw), address(factory),
                cap, def, builderAddr, builderRate, "v", "V"
            )
        ));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(factory), salt, initHash
        )))));
        _mockVaultCorePrecompiles(predicted, 0);

        vm.prank(creator);
        return _createVaultDynamic(creator, name, 1000e6);
    }

    function test_factory_default_deposit_fee_applied_to_new_vault() public {
        _fundFloat(1e6);
        address vault = _deployVaultWithCurrentDefaults(alice, "alice");
        assertEq(CreatorVault(vault).depositFeeBps(), 25, "vault inherits factory default at deploy");
    }

    function test_factory_default_deposit_fee_cap_applied_to_new_vault() public {
        _fundFloat(1e6);
        address vault = _deployVaultWithCurrentDefaults(alice, "alice");
        assertEq(CreatorVault(vault).MAX_DEPOSIT_FEE_BPS(), 100, "vault inherits factory cap at deploy");
    }

    function test_admin_propose_new_default_deposit_fee() public {
        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.DepositFeeDefaultProposed(
            30, uint64(block.timestamp + 24 hours)
        );
        vm.prank(admin); factory.proposeDepositFeeDefault(30);

        (uint16 newBps, uint64 ea) = factory.pendingDepositFeeDefault();
        assertEq(newBps, 30);
        assertEq(ea, uint64(block.timestamp + 24 hours));
    }

    function test_admin_cannot_propose_default_above_cap() public {
        // Cap is 100; propose default = 101 must revert.
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.DepositFeeDefaultAboveCap.selector, uint16(101), uint16(100)
            )
        );
        factory.proposeDepositFeeDefault(101);
    }

    function test_default_executed_after_timelock() public {
        vm.prank(admin); factory.proposeDepositFeeDefault(50);
        vm.warp(block.timestamp + 24 hours);

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.DepositFeeDefaultExecuted(50);
        vm.prank(admin); factory.executeDepositFeeDefault();
        assertEq(factory.defaultDepositFeeBps(), 50);
    }

    function test_default_execute_before_timelock_reverts() public {
        vm.prank(admin); factory.proposeDepositFeeDefault(50);
        uint64 ea = uint64(block.timestamp + 24 hours);

        vm.warp(block.timestamp + 24 hours - 1);
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.TimelockNotElapsed.selector, ea, uint64(block.timestamp)
            )
        );
        factory.executeDepositFeeDefault();
    }

    function test_default_execute_succeeds_exactly_at_executable_at() public {
        // Boundary: block.timestamp == executableAt must succeed.
        vm.prank(admin); factory.proposeDepositFeeDefault(50);
        (, uint64 ea) = factory.pendingDepositFeeDefault();
        vm.warp(uint256(ea));
        vm.prank(admin); factory.executeDepositFeeDefault();
        assertEq(factory.defaultDepositFeeBps(), 50);
    }

    function test_default_change_does_not_affect_existing_vaults() public {
        _fundFloat(2e6);

        // Deploy vault A at default = 25.
        address vaultA = _deployVaultWithCurrentDefaults(alice, "alice");
        assertEq(CreatorVault(vaultA).depositFeeBps(), 25);

        // Admin changes default to 50.
        vm.prank(admin); factory.proposeDepositFeeDefault(50);
        vm.warp(block.timestamp + 24 hours);
        vm.prank(admin); factory.executeDepositFeeDefault();
        assertEq(factory.defaultDepositFeeBps(), 50);

        // Vault A's bps unchanged.
        assertEq(CreatorVault(vaultA).depositFeeBps(), 25, "existing vault unaffected");

        // Deploy vault B; inherits new default.
        address vaultB = _deployVaultWithCurrentDefaults(bob, "bob");
        assertEq(CreatorVault(vaultB).depositFeeBps(), 50, "new vault inherits 50");
    }

    function test_cap_change_does_not_affect_existing_vaults() public {
        _fundFloat(1e6);

        // Deploy vault A at cap = 100.
        address vaultA = _deployVaultWithCurrentDefaults(alice, "alice");
        assertEq(CreatorVault(vaultA).MAX_DEPOSIT_FEE_BPS(), 100);

        // Admin changes cap to 200.
        vm.prank(admin); factory.proposeDepositFeeCap(200);
        vm.warp(block.timestamp + 24 hours);
        vm.prank(admin); factory.executeDepositFeeCap();
        assertEq(factory.currentDepositFeeCapBps(), 200);

        // Vault A's MAX_DEPOSIT_FEE_BPS is immutable; unchanged.
        assertEq(CreatorVault(vaultA).MAX_DEPOSIT_FEE_BPS(), 100, "existing vault immutable cap unaffected");
    }

    function test_cap_change_below_default_reverts() public {
        // Default is 25; propose cap = 10 < default must revert.
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.DepositFeeCapBelowDefault.selector, uint16(10), uint16(25)
            )
        );
        factory.proposeDepositFeeCap(10);
    }

    function test_cap_zero_reverts() public {
        vm.prank(admin);
        vm.expectRevert(Factory.DepositFeeCapZero.selector);
        factory.proposeDepositFeeCap(0);
    }

    function test_cancel_default_permissionless() public {
        vm.prank(admin); factory.proposeDepositFeeDefault(50);

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.DepositFeeDefaultCancelled(50);
        vm.prank(alice); // permissionless
        factory.cancelPendingDepositFeeDefault();

        (uint16 newBps, uint64 ea) = factory.pendingDepositFeeDefault();
        assertEq(newBps, 0); assertEq(ea, 0);
    }

    function test_cancel_cap_permissionless() public {
        vm.prank(admin); factory.proposeDepositFeeCap(200);

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.DepositFeeCapCancelled(200);
        vm.prank(alice); // permissionless
        factory.cancelPendingDepositFeeCap();

        (uint16 newBps, uint64 ea) = factory.pendingDepositFeeCap();
        assertEq(newBps, 0); assertEq(ea, 0);
    }

    // ─── PR 6d: factory builder address + fee rate defaults ──────────

    /// @dev Configures factory builder defaults via the timelocks (max
    ///      delay = 7 days for the address). Vault deploys after this
    ///      pick up the configured values.
    function _setFactoryBuilderDefaults(address addr, uint64 rate) internal {
        if (factory.defaultBuilderAddress() != addr) {
            vm.prank(admin); factory.proposeBuilderAddressDefault(addr);
            vm.warp(block.timestamp + 7 days);
            vm.prank(admin); factory.executeBuilderAddressDefault();
        }
        if (factory.defaultBuilderFeeRate() != rate) {
            vm.prank(admin); factory.proposeBuilderFeeRateDefault(rate);
            vm.warp(block.timestamp + 24 hours);
            vm.prank(admin); factory.executeBuilderFeeRateDefault();
        }
    }

    function test_new_vault_inherits_factory_builder_address() public {
        _setFactoryBuilderDefaults(address(0xBEE), 50);
        _fundFloat(1e6);
        address vault = _deployVaultWithCurrentDefaults(alice, "alice");
        assertEq(CreatorVault(vault).INITIAL_BUILDER(), address(0xBEE));
    }

    function test_new_vault_inherits_factory_builder_rate() public {
        _setFactoryBuilderDefaults(address(0xBEE), 75);
        _fundFloat(1e6);
        address vault = _deployVaultWithCurrentDefaults(alice, "alice");
        assertEq(CreatorVault(vault).INITIAL_BUILDER_FEE_RATE(), 75);
    }

    function test_admin_proposes_builder_address_change_7d() public {
        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.BuilderAddressDefaultProposed(
            address(0xBEE), uint64(block.timestamp + 7 days)
        );
        vm.prank(admin); factory.proposeBuilderAddressDefault(address(0xBEE));

        (address addr, uint64 ea) = factory.pendingBuilderAddressDefault();
        assertEq(addr, address(0xBEE));
        assertEq(ea, uint64(block.timestamp + 7 days));
    }

    function test_admin_proposes_builder_rate_change_24h() public {
        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.BuilderFeeRateDefaultProposed(
            100, uint64(block.timestamp + 24 hours)
        );
        vm.prank(admin); factory.proposeBuilderFeeRateDefault(100);

        (uint64 rate, uint64 ea) = factory.pendingBuilderFeeRateDefault();
        assertEq(rate, 100);
        assertEq(ea, uint64(block.timestamp + 24 hours));
    }

    function test_builder_address_execute_reverts_before_7_days() public {
        vm.prank(admin); factory.proposeBuilderAddressDefault(address(0xBEE));
        uint64 ea = uint64(block.timestamp + 7 days);

        // 24h short of 7d must revert.
        vm.warp(block.timestamp + 6 days + 23 hours);
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.TimelockNotElapsed.selector, ea, uint64(block.timestamp)
            )
        );
        factory.executeBuilderAddressDefault();
    }

    function test_builder_address_execute_succeeds_exactly_at_executable_at() public {
        vm.prank(admin); factory.proposeBuilderAddressDefault(address(0xBEE));
        (, uint64 ea) = factory.pendingBuilderAddressDefault();
        vm.warp(uint256(ea));
        vm.prank(admin); factory.executeBuilderAddressDefault();
        assertEq(factory.defaultBuilderAddress(), address(0xBEE));
    }

    function test_builder_rate_execute_succeeds_exactly_at_executable_at() public {
        vm.prank(admin); factory.proposeBuilderFeeRateDefault(50);
        (, uint64 ea) = factory.pendingBuilderFeeRateDefault();
        vm.warp(uint256(ea));
        vm.prank(admin); factory.executeBuilderFeeRateDefault();
        assertEq(factory.defaultBuilderFeeRate(), 50);
    }

    function test_factory_builder_change_does_not_affect_existing_vaults() public {
        _setFactoryBuilderDefaults(address(0xBEE), 50);
        _fundFloat(2e6);

        // Vault A inherits (0xBEE, 50).
        address vaultA = _deployVaultWithCurrentDefaults(alice, "alice");
        assertEq(CreatorVault(vaultA).INITIAL_BUILDER(), address(0xBEE));
        assertEq(CreatorVault(vaultA).INITIAL_BUILDER_FEE_RATE(), 50);

        // Admin changes factory defaults.
        _setFactoryBuilderDefaults(address(0xCAFE), 100);

        // Vault A's immutables unchanged.
        assertEq(CreatorVault(vaultA).INITIAL_BUILDER(), address(0xBEE));
        assertEq(CreatorVault(vaultA).INITIAL_BUILDER_FEE_RATE(), 50);

        // Vault B inherits the new defaults.
        address vaultB = _deployVaultWithCurrentDefaults(bob, "bob");
        assertEq(CreatorVault(vaultB).INITIAL_BUILDER(), address(0xCAFE));
        assertEq(CreatorVault(vaultB).INITIAL_BUILDER_FEE_RATE(), 100);
    }

    function test_per_vault_override_via_PR4_mechanism_works() public {
        _setFactoryBuilderDefaults(address(0xBEE), 50);
        _fundFloat(1e6);
        address vault = _deployVaultWithCurrentDefaults(alice, "alice");
        CreatorVault v = CreatorVault(vault);

        // Admin overrides per-vault via the PR 4 propose/execute path.
        vm.prank(admin); v.proposeBuilderFeeChange(address(0xCAFE), 200);
        vm.warp(block.timestamp + 24 hours);

        // CoreWriter call is mocked; the assertion is that execute
        // doesn't revert (state machine works) and emits the
        // BuilderApproved + BuilderFeeChangeExecuted events.
        vm.expectEmit(true, true, true, true, vault);
        emit CreatorVault.BuilderApproved(address(0xCAFE), 200);
        vm.prank(admin); v.executeBuilderFeeChange();

        // Vault's immutable INITIAL_BUILDER reflects deploy-time value,
        // not the override (this is by design -- audit forensics).
        assertEq(v.INITIAL_BUILDER(), address(0xBEE), "immutable unchanged by override");
    }

    function test_cancel_builder_address_permissionless() public {
        vm.prank(admin); factory.proposeBuilderAddressDefault(address(0xBEE));

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.BuilderAddressDefaultCancelled(address(0xBEE));
        vm.prank(alice); // permissionless
        factory.cancelPendingBuilderAddressDefault();

        (address addr, uint64 ea) = factory.pendingBuilderAddressDefault();
        assertEq(addr, address(0)); assertEq(ea, 0);
    }

    function test_cancel_builder_rate_permissionless() public {
        vm.prank(admin); factory.proposeBuilderFeeRateDefault(100);

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.BuilderFeeRateDefaultCancelled(100);
        vm.prank(alice); // permissionless
        factory.cancelPendingBuilderFeeRateDefault();

        (uint64 rate, uint64 ea) = factory.pendingBuilderFeeRateDefault();
        assertEq(rate, 0); assertEq(ea, 0);
    }

    function test_builder_address_delay_is_7d_not_24h() public {
        // Specifically asserts the asymmetry: address uses TREASURY-tier
        // 7-day delay, rate uses FEE-tier 24h delay. Execute at 24h
        // must revert; execute at 7d succeeds.
        vm.prank(admin); factory.proposeBuilderAddressDefault(address(0xBEE));
        vm.warp(block.timestamp + 24 hours);
        vm.prank(admin);
        vm.expectRevert(); // TimelockNotElapsed
        factory.executeBuilderAddressDefault();
    }

    // ─── PR 6e: MIN_INITIAL_STAKE configurable with 7d timelock ──────

    function test_factory_initial_min_stake_is_100() public view {
        // PR 6e initial value (lowered from PR 5's $1000 constant to
        // $100 state-with-timelock). Admin can crank back up via
        // propose + execute.
        assertEq(factory.minInitialStakeUsdc(), 100e6);
    }

    function test_createVault_below_min_reverts() public {
        // $50 stake when min is $100 -- reverts.
        _fundFloat(1e6); _seedCreator(alice, 50e6);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.InitialStakeBelowMinimum.selector,
                uint256(50e6), uint256(100e6)
            )
        );
        factory.createVault("alice", 50e6, "v", "V");
    }

    function test_admin_proposes_min_stake_change() public {
        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.MinStakeChangeProposed(
            500e6, uint64(block.timestamp + 7 days)
        );
        vm.prank(admin); factory.proposeMinStakeChange(500e6);

        (uint256 newMin, uint64 ea) = factory.pendingMinStakeChange();
        assertEq(newMin, 500e6);
        assertEq(ea, uint64(block.timestamp + 7 days));
    }

    function test_min_stake_change_executes_after_7d() public {
        // Specifically asserts the 7-day delay (stake-tier).
        vm.prank(admin); factory.proposeMinStakeChange(500e6);

        // 24h short of 7d must revert.
        vm.warp(block.timestamp + 6 days + 23 hours);
        vm.prank(admin);
        vm.expectRevert(); // TimelockNotElapsed
        factory.executeMinStakeChange();

        // Cross 7d boundary.
        vm.warp(block.timestamp + 1 hours);
        vm.prank(admin); factory.executeMinStakeChange();
        assertEq(factory.minInitialStakeUsdc(), 500e6);
    }

    function test_min_stake_execute_succeeds_exactly_at_executable_at() public {
        // Boundary check: block.timestamp == executableAt must succeed.
        vm.prank(admin); factory.proposeMinStakeChange(500e6);
        (, uint64 ea) = factory.pendingMinStakeChange();
        vm.warp(uint256(ea));
        vm.prank(admin); factory.executeMinStakeChange();
        assertEq(factory.minInitialStakeUsdc(), 500e6);
    }

    function test_propose_min_stake_zero_reverts() public {
        vm.prank(admin);
        vm.expectRevert(Factory.MinStakeZero.selector);
        factory.proposeMinStakeChange(0);
    }

    function test_min_stake_change_propagates_to_subsequent_creates() public {
        // Bump min to $500; new createVault must require >= $500.
        vm.prank(admin); factory.proposeMinStakeChange(500e6);
        vm.warp(block.timestamp + 7 days);
        vm.prank(admin); factory.executeMinStakeChange();
        assertEq(factory.minInitialStakeUsdc(), 500e6);

        // $499 stake now reverts.
        _fundFloat(1e6); _seedCreator(alice, 499e6);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.InitialStakeBelowMinimum.selector,
                uint256(499e6), uint256(500e6)
            )
        );
        factory.createVault("alice", 499e6, "v", "V");
    }

    function test_existing_vaults_unaffected_by_min_stake_change() public {
        // Vault A deployed at min = $100. Admin bumps min to $500.
        // Vault A continues operating normally (deposits, redeems).
        _fundFloat(1e6);
        address vaultA = _deployVaultWithCurrentDefaults(alice, "alice");
        CreatorVault v = CreatorVault(vaultA);

        // Bump min stake to $500.
        vm.prank(admin); factory.proposeMinStakeChange(500e6);
        vm.warp(block.timestamp + 7 days);
        vm.prank(admin); factory.executeMinStakeChange();
        assertEq(factory.minInitialStakeUsdc(), 500e6);

        // Vault A's existing state intact. A follower deposit (≥
        // vault MIN_DEPOSIT_USDC = $10) still works -- factory minimum
        // applies only at createVault, not to follower deposits.
        usdc.mint(bob, 100e6);
        vm.prank(bob); usdc.approve(vaultA, type(uint256).max);
        vm.prank(bob); v.deposit(100e6, bob);
        assertGt(v.balanceOf(bob), 0, "existing vault still accepts deposits");
    }

    function test_cancel_min_stake_permissionless() public {
        vm.prank(admin); factory.proposeMinStakeChange(500e6);

        vm.expectEmit(true, true, true, true, address(factory));
        emit Factory.MinStakeChangeCancelled(500e6);
        vm.prank(alice); // permissionless
        factory.cancelPendingMinStakeChange();

        (uint256 newMin, uint64 ea) = factory.pendingMinStakeChange();
        assertEq(newMin, 0); assertEq(ea, 0);
    }
}
