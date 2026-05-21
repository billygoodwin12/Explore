import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";
import { TopNav } from "@/components/nav/TopNav";
import { WrongChainBanner } from "@/components/primitives/WrongChainBanner";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Theorise",
  description: "Creator-vault platform on Hyperliquid.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(GeistSans.variable, GeistMono.variable, "font-sans")}
    >
      <body>
        <Providers>
          <TopNav />
          <div className="pt-14">
            <WrongChainBanner />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
