import React from "react";
import { useBotSocket } from "./hooks/useBotSocket";
import { PortfolioHeader } from "./components/PortfolioHeader";
import { FollowedWallets } from "./components/FollowedWallets";
import { ActivePositions } from "./components/ActivePositions";
import { SignalFeed } from "./components/SignalFeed";
import { SystemHealth } from "./components/SystemHealth";

export default function App() {
  const { snapshot, events, connected, sendCommand } = useBotSocket();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          Polymarket Copy-Trading Bot
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-500"}`}
          />
          <span className="text-gray-400">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </header>

      <PortfolioHeader
        snapshot={snapshot}
        connected={connected}
        onPause={() => sendCommand("pause")}
        onResume={() => sendCommand("resume")}
        onKill={() => sendCommand("kill")}
      />

      <ActivePositions positions={snapshot?.positions ?? []} />

      <div className="grid grid-cols-2 gap-6">
        <FollowedWallets wallets={snapshot?.followed_wallets ?? []} />
        <SignalFeed events={events} />
      </div>

      <SystemHealth
        system={snapshot?.system ?? null}
        lastHeartbeat={snapshot?.last_heartbeat_ts ?? 0}
      />
    </div>
  );
}
