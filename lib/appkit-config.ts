import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { mainnet, polygon, base, solana } from "@reown/appkit/networks";
import { cookieStorage, createStorage } from "wagmi";
import type { AppKitNetwork } from "@reown/appkit/networks";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error("NEXT_PUBLIC_REOWN_PROJECT_ID is not set");
}

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  mainnet,
  polygon,
  base,
  solana,
];

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

export const solanaAdapter = new SolanaAdapter();

export const metadata = {
  name: "Wayne State NFT Pricing Study",
  description:
    "Wallet verification for an IRB-approved academic study on NFT pricing.",
  url:
    typeof window !== "undefined"
      ? window.location.origin
      : "https://example.com",
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
};
