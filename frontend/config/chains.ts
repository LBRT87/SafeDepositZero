import { defineChain } from "viem";
import { arbitrumSepolia } from "viem/chains";

// Robinhood Chain testnet (Arbitrum Orbit L2). Chain id, RPC and explorer from docs.robinhood.com/chain/connecting.
export const robinhoodTestnet = defineChain({
  id: Number(process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_CHAIN_ID || 46_630),
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_EXPLORER_URL || "https://explorer.testnet.chain.robinhood.com" },
  },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

export const SUPPORTED_CHAINS = [arbitrumSepolia, robinhoodTestnet] as const;

/** The chain the app reads and writes. NEXT_PUBLIC_CHAIN=robinhood switches a deployment to Robinhood testnet. */
export const PRIMARY_CHAIN = process.env.NEXT_PUBLIC_CHAIN === "robinhood" ? robinhoodTestnet : arbitrumSepolia;

/** Optional private RPC for reads; the chain's public RPC is used when it's empty. */
export const READ_RPC_URL =
  PRIMARY_CHAIN.id === arbitrumSepolia.id
    ? process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || arbitrumSepolia.rpcUrls.default.http[0]
    : robinhoodTestnet.rpcUrls.default.http[0];

export const PAXOS_FAUCET_URL = "https://faucet.paxos.com/";

export function explorerTx(chainId: number, hash: string): string {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId) ?? PRIMARY_CHAIN;
  return `${chain.blockExplorers.default.url}/tx/${hash}`;
}

export function explorerAddress(chainId: number, address: string): string {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId) ?? PRIMARY_CHAIN;
  return `${chain.blockExplorers.default.url}/address/${address}`;
}
