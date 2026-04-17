import React from "react";
import { useBotSocket } from "./hooks/useBotSocket";
import { PortfolioHeader } from "./components/PortfolioHeader";
import { MarketsTable } from "./components/MarketsTable";
import { RewardsTracker } from "./components/RewardsTracker";
import { EventsFeed } from "./components/EventsFeed";
import { SystemHealth } from "./components/SystemHealth";

export default function App() {
  const { snapshot, events, connected, sendCommand } = useBotSocket();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          Polymarket LP Bot
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

      <MarketsTable markets={snapshot?.markets ?? []} />

      <div className="grid grid-cols-2 gap-6">
        <RewardsTracker rewards={snapshot?.rewards ?? null} />
        <EventsFeed events={events} />
      </div>

      <SystemHealth
        system={snapshot?.system ?? null}
        lastHeartbeat={snapshot?.last_heartbeat_ts ?? 0}
      />
    </div>
  );
}
