import React from "react";
import type { SystemStatus } from "../types";

interface Props {
  system: SystemStatus | null;
  lastHeartbeat: number;
}

function Indicator({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-400" : "bg-red-500"}`}
    />
  );
}

export function SystemHealth({ system, lastHeartbeat }: Props) {
  const s = system ?? {};
  const heartbeatAge = Date.now() - lastHeartbeat;
  const heartbeatOk = heartbeatAge < 15000;

  return (
    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
      <h2 className="text-white text-lg font-semibold mb-4">System Health</h2>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Indicator ok={heartbeatOk} />
            <span className="text-gray-400">CLOB API</span>
          </div>
          <div className="text-gray-300 text-xs pl-4">
            <p>p50: {s.clob_latency_p50 ?? "-"}ms</p>
            <p>p99: {s.clob_latency_p99 ?? "-"}ms</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Indicator ok={s.ws_connected ?? false} />
            <span className="text-gray-400">WebSocket</span>
          </div>
          <div className="text-gray-300 text-xs pl-4">
            <p>Shards: {s.ws_shard_count ?? 0}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Indicator ok={(s.rpc_block_lag ?? 99) < 5} />
            <span className="text-gray-400">Polygon RPC</span>
          </div>
          <div className="text-gray-300 text-xs pl-4">
            <p>Block lag: {s.rpc_block_lag ?? "-"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Indicator ok={!s.llm_last_error} />
            <span className="text-gray-400">LLM Classifier</span>
          </div>
          <div className="text-gray-300 text-xs pl-4">
            <p>{s.llm_calls_per_hour ?? 0} calls/hr</p>
            <p>Avg: {s.llm_avg_latency_ms ?? "-"}ms</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Indicator ok={s.postgres_connected ?? false} />
            <span className="text-gray-400">Postgres</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Indicator ok={s.redis_connected ?? false} />
            <span className="text-gray-400">Redis</span>
          </div>
        </div>
      </div>
    </div>
  );
}
