import { Alchemy, Network } from "alchemy-sdk";

export const EVM_NETWORKS = [
  Network.ETH_MAINNET,
  Network.MATIC_MAINNET,
  Network.BASE_MAINNET,
] as const;

export type EvmNetwork = (typeof EVM_NETWORKS)[number];

export function getEvmAlchemy(network: EvmNetwork): Alchemy {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) throw new Error("ALCHEMY_API_KEY is not set");
  return new Alchemy({ apiKey, network });
}

const NFT_INTERFACES = new Set([
  "V1_NFT",
  "LegacyNft",
  "ProgrammableNFT",
  "MplCoreAsset",
  "Custom",
]);

type DasAsset = {
  interface?: string;
  compression?: { compressed?: boolean };
};

export async function countSolanaNfts(address: string): Promise<number> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) throw new Error("ALCHEMY_API_KEY is not set");
  const url = `https://solana-mainnet.g.alchemy.com/v2/${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAssetsByOwner",
      params: {
        ownerAddress: address,
        page: 1,
        limit: 100,
        displayOptions: { showFungible: false },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Alchemy Solana DAS request failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    result?: { items?: DasAsset[] };
    error?: { message?: string };
  };
  if (json.error) throw new Error(`DAS error: ${json.error.message}`);
  const items = json.result?.items ?? [];
  return items.filter(
    (a) =>
      (a.interface && NFT_INTERFACES.has(a.interface)) ||
      a.compression?.compressed === true,
  ).length;
}
