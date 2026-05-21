import type { Metadata } from "next";

import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";

export const metadata: Metadata = {
  title: "Become a creator · Theorise",
};

export default function OnboardingPage() {
  return (
    <main className="max-w-[640px] mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <span className="text-label">Onboarding</span>
        <h1 className="text-display-md">Deploy your vault</h1>
        <p className="text-[14px] text-ink-2 leading-relaxed">
          Three steps. About two minutes. Once deployed, your vault is on
          Hyperliquid and depositors can follow you.
        </p>
      </header>

      <OnboardingStepper />
    </main>
  );
}
