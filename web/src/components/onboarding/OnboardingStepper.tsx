"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";

import { Step1Username } from "@/components/onboarding/Step1Username";
import { Step2Profile } from "@/components/onboarding/Step2Profile";
import { Step3Deposit } from "@/components/onboarding/Step3Deposit";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { SuccessCard } from "@/components/onboarding/SuccessCard";
import { Button } from "@/components/ui/button";

const STEPS = ["Username", "Profile", "Deposit"] as const;

type OnboardingData = {
  username: string;
  displayName: string;
  bio: string;
};

export function OnboardingStepper() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [data, setData] = useState<OnboardingData>({
    username: "",
    displayName: "",
    bio: "",
  });

  return (
    <RKConnectButton.Custom>
      {({ openConnectModal, mounted, account }) => {
        const ready = mounted;
        const connected = ready && Boolean(account);

        if (!connected && step >= 3) {
          return (
            <ConnectGate openConnectModal={openConnectModal} ready={ready} />
          );
        }

        return (
          <div className="space-y-8">
            <StepIndicator
              current={step === 4 ? 3 : step}
              steps={[...STEPS]}
            />

            <div className="rounded-lg border border-line bg-surface p-6 sm:p-8">
              {step === 1 ? (
                <Step1Username
                  value={data.username}
                  onChange={(username) => setData((d) => ({ ...d, username }))}
                  onNext={() => setStep(2)}
                />
              ) : null}

              {step === 2 ? (
                <Step2Profile
                  username={data.username}
                  displayName={data.displayName}
                  bio={data.bio}
                  onChangeDisplayName={(displayName) =>
                    setData((d) => ({ ...d, displayName }))
                  }
                  onChangeBio={(bio) => setData((d) => ({ ...d, bio }))}
                  onBack={() => setStep(1)}
                  onNext={() => {
                    if (!connected) {
                      openConnectModal?.();
                      return;
                    }
                    setStep(3);
                  }}
                />
              ) : null}

              {step === 3 ? (
                <Step3Deposit
                  username={data.username}
                  onBack={() => setStep(2)}
                  onDeployed={() => setStep(4)}
                />
              ) : null}

              {step === 4 ? <SuccessCard username={data.username} /> : null}
            </div>
          </div>
        );
      }}
    </RKConnectButton.Custom>
  );
}

function ConnectGate({
  openConnectModal,
  ready,
}: {
  openConnectModal: (() => void) | undefined;
  ready: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-8 text-center space-y-4">
      <h2 className="text-heading-lg">Connect your wallet to continue</h2>
      <p className="text-[14px] text-ink-2 leading-relaxed max-w-md mx-auto">
        Deploying a vault is an on-chain action. Connect the wallet you want
        as the vault’s creator address.
      </p>
      <Button
        variant="primary-dark"
        size="default"
        onClick={openConnectModal}
        disabled={!ready}
      >
        Connect wallet
      </Button>
    </div>
  );
}
