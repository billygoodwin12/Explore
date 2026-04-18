import { useReducer, useEffect, useRef, useCallback } from "react";
import type {
  BotSnapshot,
  DashboardMessage,
  DashboardCommand,
  EventLogEntry,
} from "../types";

interface State {
  snapshot: BotSnapshot | null;
  events: EventLogEntry[];
  connected: boolean;
}

type Action =
  | { type: "SNAPSHOT"; payload: BotSnapshot }
  | { type: "EVENT"; payload: EventLogEntry }
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED" };

const MAX_EVENTS = 200;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SNAPSHOT":
      return { ...state, snapshot: action.payload };
    case "EVENT":
      return {
        ...state,
        events: [action.payload, ...state.events].slice(0, MAX_EVENTS),
      };
    case "CONNECTED":
      return { ...state, connected: true };
    case "DISCONNECTED":
      return { ...state, connected: false };
    default:
      return state;
  }
}

const initialState: State = {
  snapshot: null,
  events: [],
  connected: false,
};

let eventCounter = 0;

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function formatSignalMessage(payload: any): { msg: string; severity: EventLogEntry["severity"] } {
  const who = payload.whaleUsername ?? shortAddr(payload.whaleAddress ?? "0x0");
  const market = payload.marketTitle ?? payload.marketSlug ?? "?";
  const side = payload.side ?? "?";
  const whalePrice = payload.whalePrice ?? 0;
  const whaleSize = payload.whaleSizeUsdc ?? 0;

  if (payload.disposition === "COPIED") {
    const size = payload.ourSizeUsdc?.toFixed(0) ?? "?";
    const price = payload.ourFillPrice?.toFixed(3) ?? "?";
    return {
      msg: `COPIED ${side} $${size} @ ${price} on "${market}" (from ${who})`,
      severity: "success",
    };
  }
  if (payload.disposition === "SKIPPED") {
    return {
      msg: `SKIPPED ${side} on "${market}" — ${payload.reason} (from ${who} $${whaleSize.toFixed(0)})`,
      severity: "warning",
    };
  }
  if (payload.disposition === "MISSED") {
    return {
      msg: `MISSED ${side} on "${market}" — ${payload.reason ?? "unfilled"}`,
      severity: "error",
    };
  }
  return {
    msg: `SIGNAL ${side} on "${market}" from ${who}`,
    severity: "info",
  };
}

export function useBotSocket() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(1000);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/dashboard`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      dispatch({ type: "CONNECTED" });
      reconnectDelay.current = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as DashboardMessage;
        switch (msg.type) {
          case "snapshot":
            dispatch({ type: "SNAPSHOT", payload: msg.payload });
            break;
          case "signal": {
            const p: any = msg.payload;
            const { msg: text, severity } = formatSignalMessage(p);
            dispatch({
              type: "EVENT",
              payload: {
                id: String(++eventCounter),
                timestamp: p.timestamp,
                severity,
                message: text,
              },
            });
            break;
          }
          case "fill": {
            const p: any = msg.payload;
            const txt = p.type === "EXIT"
              ? `EXIT ${p.exitType} @ ${p.exitPrice?.toFixed(3)} pnl $${p.realizedPnl?.toFixed(2)}`
              : `FILL ${p.side} $${p.size?.toFixed(0)} @ ${p.price?.toFixed(3)} on "${p.market}"`;
            dispatch({
              type: "EVENT",
              payload: {
                id: String(++eventCounter),
                timestamp: p.timestamp,
                severity: "success",
                message: txt,
              },
            });
            break;
          }
          case "risk":
            dispatch({
              type: "EVENT",
              payload: {
                id: String(++eventCounter),
                timestamp: (msg.payload as any).timestamp ?? Date.now(),
                severity: "error",
                message: `RISK: ${(msg.payload as any).type}`,
              },
            });
            break;
          case "system":
            break;
        }
      } catch {}
    };

    ws.onclose = () => {
      dispatch({ type: "DISCONNECTED" });
      setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const sendCommand = useCallback((action: DashboardCommand["action"]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "command", action }));
    }
  }, []);

  return { ...state, sendCommand };
}
