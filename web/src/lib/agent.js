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

const MODEL = process.env.MODEL || "openai/gpt-oss-120b";

// ---------- סוכן 1: החוקר — אוסף ראיות עם כלים ----------
const investigator = new Agent({
  name: "Investigator",
  model: MODEL,
  tools,
  instructions: `
You are an SRE incident investigator for "orders-service", an HTTP service that manages orders
and depends on a database and an external payment provider.
You can ONLY learn about the service through your tools. You have no access to its code or configuration.
Your job is to find WHAT is wrong and collect evidence. You do NOT decide what to do next — another agent does that.

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
  "confidence": "high | medium | low"
}
`,
});

// ---------- סוכן 2: המחליט — בלי כלים, רק ממצאים ----------
const responder = new Agent({
  name: "Incident Responder",
  model: MODEL,
  instructions: `
You are an on-call incident commander. You receive the findings of an investigator agent
about "orders-service" (an orders API that depends on a database and an external payment provider).
You have NO tools. Decide ONLY based on the findings you are given — do not invent new evidence.

Decide:
- priority: P1 (customers cannot use core functionality), P2 (partial impact or degraded performance),
  P3 (minor), none (healthy)
- nextStep: the single most important action to take now
- reasoning: why, referring to the evidence

Guidelines:
- bad_deployment with a new version: rollback to the previous version is usually the fastest fix.
- database_unavailable: check the database host/connectivity, escalate to the DB owner.
- external_dependency_down: check the provider's status page, consider retries/fallback, notify the provider.
- performance_degradation: find the slow component, check resource usage, consider scaling.
- healthy: no action needed, keep monitoring.

Respond with ONLY a JSON object, no markdown, in this exact shape:
{
  "priority": "P1 | P2 | P3 | none",
  "nextStep": "<the recommended next action in Hebrew>",
  "reasoning": "<one or two sentences in Hebrew explaining the decision>"
}
`,
});

// ---------- עזר: מוציא JSON מתשובת מודל ----------
function parseJson(text, fallback) {
  const match = String(text ?? "").match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match ? match[0] : text);
  } catch {
    return fallback;
  }
}

// ---------- הפעלת החקירה: שני סוכנים ברצף ----------
export async function investigate() {
  // שלב 1: החוקר מפעיל כלים ואוסף ראיות
  const investigation = await run(
    investigator,
    "Investigate orders-service now and report your findings.",
    { maxTurns: 12 },
  );

  const toolsUsed = investigation.newItems
    .filter((item) => item.type === "tool_call_item")
    .map((item) => item.rawItem?.name);

  const findings = parseJson(investigation.finalOutput, {
    faultType: "unknown",
    summary: String(investigation.finalOutput ?? ""),
    evidence: [],
    confidence: "low",
  });

  // שלב 2: המחליט מקבל רק את הממצאים, ומחליט מה עושים
  const decisionRun = await run(
    responder,
    `Findings from the investigator:\n${JSON.stringify(findings, null, 2)}`,
  );

  const decision = parseJson(decisionRun.finalOutput, {
    priority: "unknown",
    nextStep: String(decisionRun.finalOutput ?? ""),
    reasoning: "",
  });

  // מאחדים לדוח אחד, באותו מבנה שהדף כבר מכיר, ועוד שדות
  return {
    report: { ...findings, ...decision },
    toolsUsed,
  };
}
