import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getEnv } from "../config/index.js";
import { setAppState, getAppState } from "../persist/redis.js";
import { cancelAllOrders } from "../clob/orders.js";
import { StateBroadcaster } from "./state-broadcaster.js";
import { logger } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function createServer(broadcaster: StateBroadcaster) {
  const env = getEnv();
  const app = Fastify({ logger: false });

  await app.register(fastifyWebsocket);

  await app.register(fastifyStatic, {
    root: join(__dirname, "../../dashboard/dist"),
    prefix: "/",
    decorateReply: false,
  });

  app.get("/ws/dashboard", { websocket: true }, (socket, req) => {
    broadcaster.addClient(socket as unknown as import("ws").WebSocket);

    socket.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          action: string;
        };

        if (msg.type !== "command") return;

        switch (msg.action) {
          case "pause": {
            const state = await getAppState();
            await setAppState({
              ...state,
              mode: "COOLDOWN",
              pausedAt: Date.now(),
            });
            logger.info("Dashboard command: PAUSE");
            break;
          }
          case "resume": {
            const state = await getAppState();
            await setAppState({
              ...state,
              halted: false,
              mode: env.DRY_RUN ? "PAPER" : "LIVE",
              pausedAt: null,
              reason: null,
            });
            logger.info("Dashboard command: RESUME");
            break;
          }
          case "kill": {
            await setAppState({
              halted: true,
              reason: "Manual kill via dashboard",
              mode: "HALTED",
              pausedAt: Date.now(),
            });
            try {
              await cancelAllOrders();
            } catch (err) {
              logger.error({ err }, "Cancel all failed during kill");
            }
            logger.warn("Dashboard command: KILL — all orders cancelled");
            break;
          }
          default:
            logger.warn({ action: msg.action }, "Unknown dashboard command");
        }
      } catch (err) {
        logger.error({ err }, "Dashboard command parse error");
      }
    });
  });

  app.get("/api/health", async () => {
    return { status: "ok", uptime: process.uptime() };
  });

  return app;
}

export async function startServer(broadcaster: StateBroadcaster) {
  const env = getEnv();
  const app = await createServer(broadcaster);

  await app.listen({
    port: env.DASHBOARD_PORT,
    host: "127.0.0.1",
  });

  logger.info(
    { port: env.DASHBOARD_PORT },
    "Dashboard server listening on 127.0.0.1",
  );

  return app;
}
