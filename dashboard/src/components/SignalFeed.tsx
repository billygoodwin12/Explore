import React from "react";
import type { EventLogEntry } from "../types";

interface Props {
  events: EventLogEntry[];
}

const severityStyles: Record<string, { icon: string; color: string }> = {
  info: { icon: "->", color: "text-blue-400" },
  warning: { icon: "!!", color: "text-amber-400" },
  error: { icon: "XX", color: "text-red-400" },
  success: { icon: "OK", color: "text-green-400" },
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

export function SignalFeed({ events }: Props) {
  return (
    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
      <h2 className="text-white text-lg font-semibold mb-4">Signal Feed</h2>
      <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
        {events.length === 0 ? (
          <p className="text-gray-400">No signals yet — waiting for whale activity</p>
        ) : (
          events.map((event) => {
            const style = severityStyles[event.severity] ?? severityStyles.info!;
            return (
              <div key={event.id} className="flex gap-2">
                <span className="text-gray-500 shrink-0">{formatTimestamp(event.timestamp)}</span>
                <span className={`shrink-0 ${style.color}`}>{style.icon}</span>
                <span className="text-gray-300 truncate">{event.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
