// Owner operations on MiniSwap, used by scripts/set-rate.ts and the async tests.
import { Contract, JsonRpcProvider, Wallet, formatUnits, parseUnits } from "ethers";
import { DEPLOYER_PRIVATE_KEY, RPC_URL, loadArtifact, readDeployment } from "./deployment.ts";

/** Sets the on-chain rate (TKB per TKA) and waits until it is mined. */
export async function setRate(newRate: string): Promise<{ before: string; after: string }> {
  const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1, pollingInterval: 500 });
  try {
    const owner = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const miniSwap: any = new Contract(readDeployment().miniSwap, loadArtifact("MiniSwap").abi, owner);
    const before = await miniSwap.rate();
    await (await miniSwap.setRate(parseUnits(newRate, 18))).wait();
    return { before: formatUnits(before, 18), after: formatUnits(await miniSwap.rate(), 18) };
  } finally {
    provider.destroy();
  }
}
