// Deploys TKA, TKB and MiniSwap, funds the trader account used by the API
// and writes the addresses to deployments/local.json.
import { ContractFactory, JsonRpcProvider, MaxUint256, Wallet, parseUnits } from "ethers";
import {
  DEPLOYER_PRIVATE_KEY,
  RPC_URL,
  TRADER_PRIVATE_KEY,
  loadArtifact,
  writeDeployment,
  type Deployment,
} from "../shared/deployment.ts";

const INITIAL_RATE = parseUnits("2", 18); // 1 TKA = 2 TKB
const FEE_BPS = 30; // 0.3% protocol fee
const TOKEN_SUPPLY = parseUnits("1000000000", 18);
const POOL_LIQUIDITY = parseUnits("100000000", 18);
// Shown on screen. A `npm run perf` spends ~1,500 TKA; `npm run reset` restores it.
const TRADER_BALANCE = parseUnits("1000000", 18);

const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 });
const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
const trader = new Wallet(TRADER_PRIVATE_KEY, provider);

// Mine every transaction immediately while deploying, so setup takes
// seconds instead of waiting for one interval per transaction.
await provider.send("evm_setAutomine", [true]);

const token = loadArtifact("TestToken");
const tokenFactory = new ContractFactory(token.abi, token.bytecode, deployer);
const tka: any = await (await tokenFactory.deploy("Token A", "TKA", TOKEN_SUPPLY)).waitForDeployment();
const tkb: any = await (await tokenFactory.deploy("Token B", "TKB", TOKEN_SUPPLY)).waitForDeployment();

const miniSwapArtifact = loadArtifact("MiniSwap");
const miniSwapFactory = new ContractFactory(miniSwapArtifact.abi, miniSwapArtifact.bytecode, deployer);
const miniSwap = await (
  await miniSwapFactory.deploy(await tka.getAddress(), await tkb.getAddress(), INITIAL_RATE, FEE_BPS)
).waitForDeployment();
const miniSwapAddress = await miniSwap.getAddress();

// Liquidity for the pool and balances for the trader account.
for (const tokenContract of [tka, tkb]) {
  await (await tokenContract.transfer(miniSwapAddress, POOL_LIQUIDITY)).wait();
  await (await tokenContract.transfer(trader.address, TRADER_BALANCE)).wait();
  // The trader allows MiniSwap to pull its tokens once, so the API never needs to approve.
  await (await tokenContract.connect(trader).approve(miniSwapAddress, MaxUint256)).wait();
}

// Back to interval mining for the demos.
await provider.send("evm_setAutomine", [false]);
// The node logs every JSON-RPC call; the indexer polls every second, which
// would drown the other logs. Swaps are logged by the API instead.
await provider.send("hardhat_setLoggingEnabled", [false]);

const deployment: Deployment = {
  chainId: Number((await provider.getNetwork()).chainId),
  deployedAtBlock: await provider.getBlockNumber(),
  miniSwap: miniSwapAddress,
  tokens: { TKA: await tka.getAddress(), TKB: await tkb.getAddress() },
  // Snapshot of this initial state, used by `npm run reset`.
  snapshotId: await provider.send("evm_snapshot", []),
};
writeDeployment(deployment);

console.log("Deployed:", deployment);
provider.destroy();
