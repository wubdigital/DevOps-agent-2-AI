import OpenAI from "openai";
import {
  Agent,
  run,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";
import { tools } from "./tools";

// ---------- חיבור ל-Groq דרך API תואם OpenAI ----------
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});
setDefaultOpenAIClient(client);
setOpenAIAPI("chat_completions");
setTracingDisabled(true);

// ---------- הגדרת הסוכן ----------
const investigator = new Agent({
  name: "Incident Investigator",
  model: process.env.MODEL || "openai/gpt-oss-120b",
  tools,
  instructions: `
You are an SRE incident investigator for "orders-service", an HTTP service that manages orders
and depends on a database and an external payment provider.
You can ONLY learn about the service through your tools. You have no access to its code or configuration.

Investigation procedure:
1. check_health - overall status and dependency checks.
2. check_version - which version is deployed.
3. probe_orders - send real traffic and see if core functionality works and how fast.
4. read_logs (limit 50) - look for errors, warnings, slow requests (>2000ms) and error types.
You may call tools again if something is unclear. Base every conclusion on evidence you actually saw.

Classify the situation as exactly one of:
- healthy: everything works, no errors, normal response times
- database_unavailable
- external_dependency_down
- performance_degradation
- bad_deployment: errors that look like a code bug (e.g. TypeError), especially with a new version
- unknown

Respond with ONLY a JSON object, no markdown, in this exact shape:
{
  "faultType": "<one of the categories above>",
  "summary": "<one or two sentences in Hebrew: what is happening>",
  "evidence": ["<specific evidence in Hebrew, quoting real values like status codes, timings, log messages>"],
  "nextStep": "<the recommended next action in Hebrew>",
  "confidence": "high | medium | low"
}
`,
});

// ---------- הפעלת החקירה ----------
export async function investigate() {
  const result = await run(
    investigator,
    "Investigate orders-service now and report your findings.",
    {
      maxTurns: 12,
    },
  );

  // אילו כלים הסוכן הפעיל, ובאיזה סדר
  const toolsUsed = result.newItems
    .filter((item) => item.type === "tool_call_item")
    .map((item) => item.rawItem?.name);

  const text = String(result.finalOutput ?? "");
  const match = text.match(/\{[\s\S]*\}/);
  let report;
  try {
    report = JSON.parse(match ? match[0] : text);
  } catch {
    report = {
      faultType: "unknown",
      summary: text,
      evidence: [],
      nextStep: "",
      confidence: "low",
    };
  }

  return { report, toolsUsed };
}
