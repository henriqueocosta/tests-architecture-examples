// Talks to the local blockchain with ethers v6. The API signs with a Hardhat
// test account (no wallet extension): a simplification for the demo.
import { Contract, Interface, JsonRpcProvider, Wallet, type ContractTransactionResponse } from "ethers";
import { loadArtifact, type Deployment } from "../../shared/deployment.ts";
import { fromUnits } from "./amounts.ts";
import type { NonceStrategyName } from "./config.ts";
import { createManagedNonce } from "./nonce/managed.ts";
import { createNaiveNonce } from "./nonce/naive.ts";
import type { NonceStrategy } from "./nonce/nonceStrategy.ts";
import type { ChainClient, SwapFailure } from "./ports.ts";

// Fixed gas limit: skipping gas estimation means a swap that will revert is
// still accepted by the node and fails when mined, asynchronously.
const SWAP_GAS_LIMIT = 200_000n;

const NONCE_STRATEGIES: Record<NonceStrategyName, (wallet: Wallet) => NonceStrategy> = {
  naive: createNaiveNonce,
  managed: createManagedNonce,
};

export function createChainClient({
  rpcUrl,
  privateKey,
  deployment,
  nonceStrategy: initialNonceStrategy,
}: {
  rpcUrl: string;
  privateKey: string;
  deployment: Deployment;
  nonceStrategy: NonceStrategyName;
}): ChainClient {
  // cacheTimeout -1: no response caching in ethers, every call reaches the node.
  const provider = new JsonRpcProvider(rpcUrl, deployment.chainId, {
    staticNetwork: true,
    cacheTimeout: -1,
    pollingInterval: 500,
  });
  const wallet = new Wallet(privateKey, provider);
  const miniSwap: any = new Contract(deployment.miniSwap, loadArtifact("MiniSwap").abi, wallet);
  const tokenAbi = loadArtifact("TestToken").abi;
  const tka: any = new Contract(deployment.tokens.TKA, tokenAbi, provider);
  const tkb: any = new Contract(deployment.tokens.TKB, tokenAbi, provider);
  // Errors a swap can revert with: MiniSwap's own and the tokens' (e.g. insufficient balance).
  const revertErrors = new Interface([
    ...loadArtifact("MiniSwap").abi.filter((item) => item.type === "error"),
    ...loadArtifact("TestToken").abi.filter((item) => item.type === "error"),
  ]);
  let nonceStrategy = NONCE_STRATEGIES[initialNonceStrategy](wallet);

  return {
    async sendSwap({ from, to, amountIn, minAmountOut }) {
      const tx = await nonceStrategy.withNonce<ContractTransactionResponse>((nonce) =>
        miniSwap.swap(deployment.tokens[from], deployment.tokens[to], amountIn, minAmountOut, {
          nonce,
          gasLimit: SWAP_GAS_LIMIT,
        }),
      );
      return tx.hash;
    },

    async waitForFailure(txHash) {
      const receipt = await provider.waitForTransaction(txHash);
      if (!receipt || receipt.status === 1) return null;
      return explainRevert(txHash, receipt.blockNumber);
    },

    getBlockNumber: () => provider.getBlockNumber(),

    async getSwappedEvents(fromBlock, toBlock) {
      const logs = await miniSwap.queryFilter(miniSwap.filters.Swapped(), fromBlock, toBlock);
      return logs.map((log: any) => ({
        txHash: log.transactionHash,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        amountOut: log.args.amountOut,
        fee: log.args.fee,
      }));
    },

    async getFeeBps() {
      return Number(await miniSwap.feeBps());
    },

    async getBalances() {
      const [TKA, TKB] = await Promise.all([tka.balanceOf(wallet.address), tkb.balanceOf(wallet.address)]);
      return { account: wallet.address, balances: { TKA, TKB } };
    },

    getNonceStrategy: () => nonceStrategy.name,
    setNonceStrategy(name) {
      nonceStrategy = NONCE_STRATEGIES[name](wallet);
    },
  };

  // Receipts do not carry the revert reason: replay the call on that block to decode it.
  async function explainRevert(txHash: string, blockNumber: number): Promise<SwapFailure> {
    const tx = await provider.getTransaction(txHash);
    try {
      await provider.call({ to: tx!.to, from: tx!.from, data: tx!.data, blockTag: blockNumber });
    } catch (err: any) {
      const decoded = err.data ? revertErrors.parseError(err.data) : null;
      if (decoded?.name === "SlippageExceeded") {
        const [amountOut, minAmountOut] = decoded.args;
        return {
          code: "SLIPPAGE_EXCEEDED",
          message: `On-chain price moved: would receive ${fromUnits(amountOut)}, minimum accepted ${fromUnits(minAmountOut)}`,
        };
      }
      if (decoded) return { code: "REVERTED", message: `Transaction reverted: ${decoded.name}` };
    }
    return { code: "REVERTED", message: "Transaction reverted" };
  }
}

export function describeChainError(err: any): string {
  return err?.info?.error?.message ?? err?.error?.message ?? err?.shortMessage ?? err?.message ?? String(err);
}
