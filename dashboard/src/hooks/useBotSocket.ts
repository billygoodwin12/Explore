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

const MAX_EVENTS = 100;

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
          case "fill":
            dispatch({
              type: "EVENT",
              payload: {
                id: String(++eventCounter),
                timestamp: msg.payload.timestamp,
                severity: "info",
                message: `FILLED ${msg.payload.side} ${msg.payload.size} @ ${msg.payload.price} on "${msg.payload.market}"`,
              },
            });
            break;
          case "news":
            dispatch({
              type: "EVENT",
              payload: {
                id: String(++eventCounter),
                timestamp: msg.payload.timestamp,
                severity:
                  msg.payload.severity === "high" ? "error" : "warning",
                message: `NEWS [${msg.payload.severity}] "${msg.payload.headline}" → ${msg.payload.affectedSlugs.length} markets`,
              },
            });
            break;
          case "risk":
            dispatch({
              type: "EVENT",
              payload: {
                id: String(++eventCounter),
                timestamp: msg.payload.timestamp,
                severity: "error",
                message: `RISK: ${msg.payload.type}${msg.payload.drawdown != null ? ` ${(msg.payload.drawdown * 100).toFixed(1)}%` : ""}`,
              },
            });
            break;
          case "system":
            dispatch({
              type: "EVENT",
              payload: {
                id: String(++eventCounter),
                timestamp: Date.now(),
                severity: "info",
                message: `SYSTEM: ${JSON.stringify(msg.payload)}`,
              },
            });
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
