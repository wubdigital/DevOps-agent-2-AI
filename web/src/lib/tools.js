import { tool } from "@openai/agents";
import { z } from "zod";

const SERVICE_URL = process.env.SERVICE_URL || "http://localhost:4000";

// פונקציית עזר: קוראת לשירות ומחזירה סטטוס, זמן תגובה ותוכן
async function callService(path, options = {}) {
  const start = Date.now();
  try {
    const res = await fetch(`${SERVICE_URL}${path}`, {
      ...options,
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { httpStatus: res.status, responseTimeMs: Date.now() - start, body };
  } catch (err) {
    return {
      error:
        err?.name === "TimeoutError"
          ? "Request timed out after 8000ms"
          : `Could not reach service: ${err?.cause?.code || err?.message}`,
      responseTimeMs: Date.now() - start,
    };
  }
}

export const checkHealth = tool({
  name: "check_health",
  description:
    "Calls GET /health on orders-service. Returns HTTP status, response time and the status of each dependency check (database, paymentProvider).",
  parameters: z.object({
    reason: z.string().describe("Briefly, why you are calling this tool now"),
  }),
  execute: async () => JSON.stringify(await callService("/health")),
});

export const checkVersion = tool({
  name: "check_version",
  description:
    "Calls GET /version. Returns the deployed service version and Node.js version.",
  parameters: z.object({
    reason: z.string().describe("Briefly, why you are calling this tool now"),
  }),
  execute: async () => JSON.stringify(await callService("/version")),
});

export const readLogs = tool({
  name: "read_logs",
  description:
    "Reads the most recent service log entries (time, level, message). Use 50 if unsure. Call probe_orders first if you need fresh traffic in the logs.",
  parameters: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .describe("How many recent log lines to return"),
  }),
  execute: async ({ limit }) =>
    JSON.stringify(await callService(`/logs?limit=${limit}`)),
});

export const probeOrders = tool({
  name: "probe_orders",
  description:
    "Sends real test traffic to the business endpoints: GET /api/orders and POST /api/orders with a test order. Shows whether core functionality works and how fast it responds.",
  parameters: z.object({
    reason: z.string().describe("Briefly, why you are calling this tool now"),
  }),
  execute: async () => {
    const list = await callService("/api/orders");
    const create = await callService("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: "agent-probe-item", price: 1 }),
    });
    return JSON.stringify({ getOrders: list, createOrder: create });
  },
});

export const tools = [checkHealth, checkVersion, readLogs, probeOrders];
