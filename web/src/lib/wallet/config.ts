import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";

import {
  hyperliquidMainnet,
  hyperliquidTestnet,
} from "@/lib/chain/hyperliquid";

const appName = "Theorise";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [injectedWallet, coinbaseWallet],
    },
  ],
  { appName, projectId: "" },
);

export const wagmiConfig = createConfig({
  chains: [hyperliquidTestnet, hyperliquidMainnet],
  connectors,
  transports: {
    [hyperliquidTestnet.id]: http(),
    [hyperliquidMainnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
