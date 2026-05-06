import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Wagmi's connectors dynamically import several optional peer
  // dependencies that we do not use. Turbopack still tries to resolve
  // them statically, so we alias them to an empty stub.
  // https://github.com/wevm/wagmi/issues/4906
  turbopack: {
    resolveAlias: {
      accounts: "./lib/wagmi-empty-module.js",
      "@coinbase/wallet-sdk": "./lib/wagmi-empty-module.js",
      "@safe-global/safe-apps-provider": "./lib/wagmi-empty-module.js",
      "@safe-global/safe-apps-sdk": "./lib/wagmi-empty-module.js",
      "@gemini-wallet/core": "./lib/wagmi-empty-module.js",
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      accounts: false,
    };
    return config;
  },
};

export default nextConfig;
