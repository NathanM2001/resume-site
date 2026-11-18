// /api/chat — Vercel serverless function for the AI resume assistant.
// Flow: browser -> this function -> Claude API -> this function -> browser.
// The API key is read from the ANTHROPIC_API_KEY environment variable on the
// server only. It is never sent to the browser and never logged.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// ===== Settings (change these in one place) =====
const MODEL = "claude-haiku-5-5";
const MAX_OUTPUT_TOKENS = 1024;    // safety ceiling; includes the model's thinking
const MAX_QUESTION_CHARS = 500;    // longest question a visitor can send
const MAX_HISTORY_MESSAGES = 6;    // past messages (3 exchanges) sent with each question
const MAX_ANSWER_CHARS = 4000;     // longest past AI answer we accept back from the browser

// The chat may only use the text between these markers in resume.md
const AI_START = "<!-- AI-DETAILS-START -->";
const AI_END = "<!-- AI-DETAILS-END -->";

// Fixed reply when Claude declines a question for safety reasons.
// No fallback model is used: a declined question gets no AI answer.
const DECLINED_REPLY =
  "Sorry, I can't help with that. I can only answer questions about Nathan's background and experience.";

// Read a file that is bundled with this function (see vercel.json "includeFiles")
function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

// Pull out only the AI Details part of resume.md (never the Website Summary)
function loadAiDetails() {
  const text = readProjectFile("resume.md");
  const start = text.indexOf(AI_START);
  const end = text.indexOf(AI_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Could not find the AI-DETAILS markers in resume.md");
  }
  return text.slice(start + AI_START.length, end).trim();
}

// Check the browser's messages. Returns an error message, or null if they are OK.
// The browser can be faked, so the server re-checks everything.
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "Please type a question.";
  }
  if (messages.length > MAX_HISTORY_MESSAGES + 1) {
    return "This conversation is too long. Please refresh the page to start a new one.";
  }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const expectedRole = i % 2 === 0 ? "user" : "assistant"; // user, assistant, user, ...
    if (!m || m.role !== expectedRole || typeof m.content !== "string" || m.content.trim() === "") {
      return "Something went wrong with this conversation. Please refresh the page and try again.";
    }
    const limit = m.role === "user" ? MAX_QUESTION_CHARS : MAX_ANSWER_CHARS;
    if (m.content.length > limit) {
      return m.role === "user"
        ? `Please keep your question under ${MAX_QUESTION_CHARS} characters.`
        : "Something went wrong with this conversation. Please refresh the page and try again.";
    }
  }
  // Alternating roles starting with "user" + an odd count means the last message is the new question
  if (messages.length % 2 === 0) {
    return "Please type a question.";
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const messages = req.body?.messages;
  const problem = validateMessages(messages);
  if (problem) {
    return res.status(400).json({ error: problem });
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const systemPrompt = readProjectFile("api/_lib/system-prompt.md").trim();
    if (!systemPrompt) {
      // Never answer without the rules in the system prompt
      throw new Error("api/_lib/system-prompt.md is empty");
    }
    const aiDetails = loadAiDetails();

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: { effort: "low" },
      // The system prompt and resume are the same on every request, so they are
      // cached: repeat requests within ~5 minutes read them at a big discount.
      system: [
        { type: "text", text: systemPrompt },
        {
          type: "text",
          text: `<resume>\n${aiDetails}\n</resume>`,
          cache_control: { type: "ephemeral" },
        },
      ],
      // Copy only role + content, so nothing extra from the browser reaches the API
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    // Token counts only (no message text) so you can check cost and caching in the logs
    console.log("chat usage", {
      stop_reason: response.stop_reason,
      input_tokens: response.usage.input_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    if (response.stop_reason === "refusal") {
      return res.status(200).json({ reply: DECLINED_REPLY });
    }

    // The answer is in "text" blocks; "thinking" blocks are skipped
    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!reply) {
      throw new Error(`No answer text returned (stop_reason: ${response.stop_reason})`);
    }

    return res.status(200).json({ reply });
  } catch (err) {
    // Details go to the server log only; the browser gets a friendly message.
    // (Check APIConnectionError before APIError: it is a kind of APIError.)
    if (err instanceof Anthropic.RateLimitError) {
      console.error("Claude API rate limit:", err.status, err.message);
      return res.status(429).json({
        error: "I'm getting a lot of questions right now. Please try again in a minute.",
      });
    }
    if (err instanceof Anthropic.APIConnectionError) {
      console.error("Could not reach the Claude API:", err.message);
    } else if (err instanceof Anthropic.APIError) {
      console.error("Claude API error:", err.status, err.message);
    } else {
      console.error("Chat server error:", err.message);
    }
    return res.status(500).json({
      error: "Sorry, I couldn't answer that right now. Please try again in a moment.",
    });
  }
}
