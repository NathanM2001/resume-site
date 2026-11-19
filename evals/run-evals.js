// evals/run-evals.js — runs every question in tests.md through the real /api/chat code
// and writes the answers next to the expected answers, for a person to grade.
//
// Run from the project folder:   node --env-file=.env evals/run-evals.js
// (--env-file loads ANTHROPIC_API_KEY from .env; the key is never printed.)
//
// Each question is asked on its own, as a brand-new conversation.

import fs from "node:fs";
import path from "node:path";
import handler from "../api/chat.js";

// Haiku 5.5 prices in dollars per token (prompts up to 100K tokens)
const PRICE = {
  input: 0.10 / 1e6,
  cacheWrite: (0.10 * 1.25) / 1e6,
  cacheRead: (0.10 * 0.1) / 1e6,
  output: 0.50 / 1e6,
};

// Read tests.md: section names are lines without "- "; questions are "- Question? Expected: ..."
function loadTests() {
  const lines = fs.readFileSync("tests.md", "utf8").split("\n");
  const tests = [];
  let section = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("- ") && line.includes(" Expected: ")) {
      const [question, expected] = line.slice(2).split(" Expected: ");
      tests.push({ section, question: question.trim(), expected: expected.trim() });
    } else if (line && !line.startsWith("- ")) {
      section = line;
    }
  }
  return tests;
}

// Call the server function directly with a fake request/response, and capture
// the token counts it logs, so this tests exactly what visitors will get.
async function ask(question) {
  let usage = null;
  const realLog = console.log;
  console.log = (label, data) => { if (label === "chat usage") usage = data; else realLog(label, data); };

  let status = 0;
  let body = null;
  const req = { method: "POST", body: { messages: [{ role: "user", content: question }] } };
  const res = {
    setHeader() {},
    status(code) { status = code; return this; },
    json(data) { body = data; return this; },
  };
  try {
    await handler(req, res);
  } finally {
    console.log = realLog;
  }
  return { status, answer: body?.reply ?? `[ERROR ${status}] ${body?.error}`, usage };
}

function costOf(u) {
  if (!u) return 0;
  return (u.input_tokens ?? 0) * PRICE.input
    + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite
    + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead
    + (u.output_tokens ?? 0) * PRICE.output;
}

const tests = loadTests();
console.log(`Running ${tests.length} questions...`);

const rows = [];
let totalCost = 0;
for (const [i, t] of tests.entries()) {
  const started = Date.now();
  const result = await ask(t.question);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const cost = costOf(result.usage);
  totalCost += cost;
  rows.push({ ...t, ...result, seconds, cost });
  console.log(`${i + 1}/${tests.length}  ${result.status}  ${seconds}s  ${t.question}`);
}

// Write a results file to read and grade
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const outFile = path.join("evals", "results", `results-${stamp}.md`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });

let md = `# Eval results — ${new Date().toLocaleString()}\n\n`;
md += `Model and settings: see api/chat.js. Questions: ${rows.length}. `;
md += `Estimated cost: $${totalCost.toFixed(4)}.\n\n`;
md += `Grade each answer: PASS (has the expected key point, no invented facts) or FAIL.\n\n`;
for (const [i, r] of rows.entries()) {
  md += `## ${i + 1}. ${r.question}\n\n`;
  md += `*${r.section}* · ${r.seconds}s · ${r.usage?.output_tokens ?? "?"} output tokens · stop: ${r.usage?.stop_reason ?? "?"}\n\n`;
  md += `**Expected:** ${r.expected}\n\n`;
  md += `**Answer:**\n\n${r.answer}\n\n`;
  md += `**Grade:** \n\n---\n\n`;
}
fs.writeFileSync(outFile, md);

console.log(`\nDone. Estimated cost: $${totalCost.toFixed(4)}`);
console.log(`Results written to ${outFile}`);
