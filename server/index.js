import "dotenv/config";
import Groq from "groq-sdk";
import { exec } from "child_process";
import { promises as fs } from "fs";
import * as readline from "readline";
import * as path from "path";
import fetch from "node-fetch";

// ─── Tools ────────────────────────────────────────────────────────────────────

async function createDirectory(dirPath = "") {
  await fs.mkdir(dirPath, { recursive: true });
  return `Directory '${dirPath}' created successfully.`;
}

async function writeFile({ filepath = "", content = "" } = {}) {
  if (!content || content.length < 100) {
    return `ERROR: Content is empty or too short (${content.length} chars). The HTML was not written. You MUST call writeFile again with the full HTML content.`;
  }
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filepath, content, "utf8");
  return `File '${filepath}' written successfully (${content.length} chars).`;
}

async function readFile(filepath = "") {
  const content = await fs.readFile(filepath, "utf8");
  return content;
}

async function executeCommand(cmd = "") {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        resolve(`ERROR: ${stderr || error.message}`);
      } else {
        resolve(stdout || `Command '${cmd}' executed successfully.`);
      }
    });
  });
}

async function listDirectory(dirPath = "") {
  const entries = await fs.readdir(dirPath);
  return entries.length
    ? entries.join("\n")
    : `Directory '${dirPath}' is empty.`;
}

async function fetchWebsite(url = "") {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SiteCloner/1.0)",
        Accept: "text/html",
      },
      timeout: 10000,
    });

    if (!res.ok) {
      return `ERROR: HTTP ${res.status} fetching ${url}`;
    }

    let html = await res.text();

    // Strip scripts, SVGs, base64 blobs — pure token waste
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "<!-- svg removed -->")
      .replace(/data:[a-z]+\/[a-z+;]+;base64,[^"']*/gi, "data:REMOVED")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\s{2,}/g, " ");

    // Keep a tight slice so the whole conversation stays under Groq's TPM limit
    const MAX_CHARS = 4000;
    if (html.length > MAX_CHARS) {
      html = html.slice(0, MAX_CHARS) + "\n<!-- TRUNCATED -->";
    }

    return html;
  } catch (err) {
    return `ERROR fetching ${url}: ${err.message}`;
  }
}

const tool_map = {
  createDirectory,
  writeFile,
  readFile,
  executeCommand,
  listDirectory,
  fetchWebsite,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSiteName(url) {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    return hostname.split(".")[0];
  } catch {
    return "site";
  }
}

function buildSystemPrompt(url, siteName) {
  return `RESPOND WITH EXACTLY ONE RAW JSON OBJECT. NO TEXT BEFORE OR AFTER. NO MARKDOWN. START WITH { END WITH }.

You are an AI Agent that works strictly in the START → THINK → TOOL → OBSERVE → OUTPUT cycle.

CRITICAL INSTRUCTION: Your ENTIRE response must always be a single raw JSON object.
- Do NOT include any text before or after the JSON.
- Do NOT use markdown fences like \`\`\`json.
- Do NOT use labels like [START] or [THINK].
- Your response must start with { and end with }.

════════════════════════════════════════════════════════════
⚠️  MANDATORY RULE — YOU MUST ACTUALLY CALL TOOLS ⚠️
════════════════════════════════════════════════════════════
You are FORBIDDEN from responding with step "OUTPUT" unless:
  1. You have already called the "writeFile" tool in a previous step, AND
  2. The OBSERVE result confirmed the file was written successfully (not an ERROR).

The ONLY correct sequence is:
  Step 1 → THINK (plan what you will build)
  Step 2 → TOOL: fetchWebsite        → fetch the real HTML from ${url}
  Step 3 → TOOL: createDirectory     → create ${siteName}_clone/
  Step 4 → TOOL: writeFile           → write FULL HTML using real colors/copy from step 2
  Step 5 → OUTPUT (only after writeFile OBSERVE says "written successfully")

════════════════════════════════════════════════════════════

Your task is to clone the website: ${url}
Site name: ${siteName}

After calling fetchWebsite, extract from the real HTML:
  - Exact color values (look for CSS variables, inline styles, Tailwind classes, hex codes)
  - Real navigation link labels and their href paths
  - Real headline and tagline copy from the hero section
  - Font family names from <link> or @import in <style> tags
  - Overall layout pattern (centered hero? sidebar? full-width?)

Use ALL of that to build a faithful clone. Do NOT invent colors or copy.

Generate a fully working single-page HTML clone with HTML, CSS, and JavaScript that includes:
  - A Header with logo, navigation links, and a CTA button
  - A Hero Section with headline, sub-headline, CTA button, and a hero visual area
  - At least 2 feature/content sections matching the real site's purpose
  - A Footer with relevant links and copyright

STRICT DESIGN RULES:
  1. Match the real site's color palette, fonts, and layout as closely as possible.
  2. Use realistic copy — real product name, real taglines, real nav items (Courses, Mentorship, Pricing, Blog, Login).
  3. ⚠️ CRITICAL LINK RULE: Every nav link, CTA button, and footer link MUST use href="#" only.
     NEVER link to the real website. Instead, use onclick to show an in-page placeholder:
       <a href="#" onclick="showPage('Courses'); return false;">Courses</a>
     In your <script> block, include this function:
       function showPage(name) {
         document.body.innerHTML = [
           '<div style="display:flex;align-items:center;justify-content:center;',
           'height:100vh;font-family:sans-serif;flex-direction:column;gap:20px;background:#f9f9f9">',
           '<h1 style="font-size:2.5rem;margin:0">' + name + '</h1>',
           '<p style="color:#888;font-size:1.1rem">This is a UI clone demo. This page is not available.</p>',
           '<button onclick="location.reload()" style="padding:12px 28px;background:#333;color:#fff;',
           'border:none;border-radius:8px;font-size:1rem;cursor:pointer">← Go Back</button>',
           '</div>'
         ].join('');
       }
  4. FULLY RESPONSIVE — must work on mobile (320px), tablet (768px), desktop (1280px+).
  5. Include a hamburger menu for mobile that toggles the nav.
  6. Use CSS media queries and CSS variables for the color palette.
  7. Use a Google Fonts CDN link matching the real site's typography.
  8. Add hover effects, smooth scroll, and subtle CSS fade-in animations on load.
  9. Everything self-contained in one index.html — all CSS in <style>, all JS in <script>.
  10. The HTML content passed to writeFile MUST be at least 3000 characters long.

Tools available:
  1. fetchWebsite(url: string)
  2. createDirectory(dirPath: string) 
  3. writeFile({ filepath: string, content: string })
  4. readFile(filepath: string)
  5. executeCommand(cmd: string)
  6. listDirectory(dirPath: string)

JSON formats (use exactly one per response):
{"step":"START","content":"..."}
{"step":"THINK","content":"..."}
{"step":"TOOL","tool_name":"fetchWebsite","tool_args":"${url}"}
{"step":"TOOL","tool_name":"createDirectory","tool_args":"${siteName}_clone"}
{"step":"TOOL","tool_name":"writeFile","tool_args":{"filepath":"${siteName}_clone/index.html","content":"<!DOCTYPE html>..."}}
{"step":"OUTPUT","content":"..."}
`;
}

function safeParse(raw = "") {
  let cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("No JSON object found");

  let depth = 0;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) throw new Error("Unclosed JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ─── Colours ──────────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function log(label, colour, content) {
  console.log(`\n${colour}${c.bold}[${label}]${c.reset} ${content}`);
}

function promptUser(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ─── Agent ────────────────────────────────────────────────────────────────────

async function runAgent(url) {
  const siteName = getSiteName(url);
  const outputPath = `${siteName}_clone/index.html`;

  const client = new Groq(); // reads GROQ_API_KEY from .env automatically

  const messages = [
    { role: "system", content: buildSystemPrompt(url, siteName) },
    { role: "user", content: `Clone the website at ${url}` },
  ];

  console.log(
    `\n${c.bold}${c.blue}════════════════════════════════════════${c.reset}`,
  );
  console.log(
    `${c.bold}${c.blue}   Website Cloner Agent — Starting Up   ${c.reset}`,
  );
  console.log(
    `${c.bold}${c.blue}════════════════════════════════════════${c.reset}\n`,
  );
  log("TARGET", c.cyan, url);
  log("MODEL", c.cyan, "llama-3.3-70b-versatile (Groq)");

  let iterations = 0;
  const MAX_ITERATIONS = 30;
  let fileWasWritten = false;
  let siteWasFetched = false;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    let response;
    // Retry loop: handles rate limits, connection errors, and transient failures
    let retryCount = 0;
    const MAX_RETRIES = 5;
    while (true) {
      try {
        response = await client.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          max_tokens: 8192,
          temperature: 0,
          messages,
        });
        break; // success — exit retry loop
      } catch (err) {
        const isRateLimit = err.status === 429;
        const isServerError = err.status >= 500;
        const isConnectionError =
          !err.status &&
          (err.code === "ECONNRESET" ||
            err.code === "ENOTFOUND" ||
            err.code === "ETIMEDOUT" ||
            err.message?.toLowerCase().includes("connection") ||
            err.message?.toLowerCase().includes("network") ||
            err.message?.toLowerCase().includes("fetch"));

        if ((isRateLimit || isServerError || isConnectionError) && retryCount < MAX_RETRIES) {
          retryCount++;
          let waitSec;
          if (isRateLimit) {
            waitSec = parseInt(err.headers?.["retry-after"] ?? "60", 10);
            log("RATE LIMIT", c.yellow, `TPM limit hit. Waiting ${waitSec}s (attempt ${retryCount}/${MAX_RETRIES})...`);
          } else if (isConnectionError) {
            waitSec = Math.min(4 ** retryCount, 60); // exponential: 4s, 16s, 60s...
            log("CONNECTION ERROR", c.yellow, `${err.message}. Retrying in ${waitSec}s (attempt ${retryCount}/${MAX_RETRIES})...`);
          } else {
            waitSec = Math.min(2 ** retryCount * 5, 60);
            log("SERVER ERROR", c.yellow, `HTTP ${err.status}. Retrying in ${waitSec}s (attempt ${retryCount}/${MAX_RETRIES})...`);
          }
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
        throw err; // non-retryable or out of retries
      }
    }

    const rawContent = response.choices[0].message.content;

    if (!rawContent || !rawContent.trim()) {
      log("WARN", c.yellow, "Model returned empty response. Nudging...");
      messages.push({
        role: "user",
        content: JSON.stringify({
          step: "OBSERVE",
          content: "Please continue with the next step.",
        }),
      });
      continue;
    }

    let parsed;
    try {
      parsed = safeParse(rawContent);
    } catch (err) {
      log(
        "PARSE ERROR",
        c.red,
        `Could not parse response.\nRAW (${rawContent.length} chars): |${rawContent.slice(0, 300)}|`,
      );
      messages.push({
        role: "user",
        content: JSON.stringify({
          step: "OBSERVE",
          content:
            "Your last response was not valid JSON. Respond with a single raw JSON object starting with { and ending with }.",
        }),
      });
      continue;
    }

    if (parsed.step === "TOOL") {
      console.log(
        `${c.gray}[DEBUG] tool: ${parsed.tool_name} | args type: ${typeof parsed.tool_args}${c.reset}`,
      );
      if (parsed.tool_name === "writeFile") {
        const args =
          typeof parsed.tool_args === "string"
            ? (() => {
                try {
                  return JSON.parse(parsed.tool_args);
                } catch {
                  return {};
                }
              })()
            : parsed.tool_args;
        console.log(
          `${c.gray}[DEBUG] content length: ${args?.content?.length ?? 0} chars${c.reset}`,
        );
      }
    }

    messages.push({ role: "assistant", content: JSON.stringify(parsed) });

    // ── Handle each step ──────────────────────────────────────────────────────

    if (parsed.step === "START") {
      log("START", c.green, parsed.content);
      messages.push({
        role: "user",
        content: JSON.stringify({
          step: "OBSERVE",
          content:
            "Understood. Proceed step by step. Remember: you MUST call createDirectory then writeFile before you can OUTPUT.",
        }),
      });
    } else if (parsed.step === "THINK") {
      log("THINK", c.yellow, parsed.content);
      messages.push({
        role: "user",
        content: JSON.stringify({
          step: "OBSERVE",
          content: "Good. Continue to the next step.",
        }),
      });
    } else if (parsed.step === "TOOL") {
      log(
        "TOOL",
        c.magenta,
        `Calling → ${c.bold}${parsed.tool_name}${c.reset}`,
      );

      let observeContent;

      if (!tool_map[parsed.tool_name]) {
        observeContent = `Tool '${parsed.tool_name}' is not available. Available: ${Object.keys(tool_map).join(", ")}`;
        log("OBSERVE", c.red, observeContent);
      } else {
        try {
          let args = parsed.tool_args;
          if (typeof args === "string") {
            try {
              args = JSON.parse(args);
            } catch {
              /* keep as plain string */
            }
          }

          if (args !== undefined) {
            const preview =
              typeof args === "string"
                ? args.slice(0, 120)
                : JSON.stringify(args).slice(0, 120);
            log("ARGS", c.gray, preview + (preview.length >= 120 ? "…" : ""));
          }

          const result = await tool_map[parsed.tool_name](args);

          if (
            parsed.tool_name === "fetchWebsite" &&
            !result.startsWith("ERROR")
          ) {
            siteWasFetched = true;
            log(
              "✓ SITE FETCHED",
              c.cyan,
              `Got ${result.length} chars of reference HTML`,
            );
          }

          if (
            parsed.tool_name === "writeFile" &&
            typeof result === "string" &&
            result.includes("written successfully")
          ) {
            fileWasWritten = true;
            log("✓ FILE WRITTEN", c.green, result);
          }

          const preview =
            typeof result === "string" && result.length > 300
              ? result.slice(0, 300) + "…"
              : result;
          log("OBSERVE", c.green, String(preview));
          // Truncate what enters message history to stay under Groq TPM limit
          const MAX_HISTORY = 3000;
          observeContent =
            typeof result === "string" && result.length > MAX_HISTORY
              ? result.slice(0, MAX_HISTORY) + "... [TRUNCATED FOR TOKEN LIMIT]"
              : result;
        } catch (err) {
          observeContent = `Tool error: ${err.message}`;
          log("OBSERVE", c.red, observeContent);
        }
      }

      messages.push({
        role: "user",
        content: JSON.stringify({ step: "OBSERVE", content: observeContent }),
      });
    } else if (parsed.step === "OBSERVE") {
      log("OBSERVE (model)", c.gray, parsed.content);
    } else if (parsed.step === "OUTPUT") {
      if (!siteWasFetched) {
        log("BLOCKED OUTPUT", c.red, "Site was never fetched.");
        messages.push({
          role: "user",
          content: JSON.stringify({
            step: "OBSERVE",
            content: `ERROR: You must call fetchWebsite("${url}") before OUTPUT to get the real colors and copy. Do it NOW.`,
          }),
        });
        continue;
      }

      if (!fileWasWritten) {
        log(
          "BLOCKED OUTPUT",
          c.red,
          "OUTPUT attempted before writeFile succeeded. Forcing file write...",
        );
        messages.push({
          role: "user",
          content: JSON.stringify({
            step: "OBSERVE",
            content: `ERROR: You cannot OUTPUT yet. The file '${outputPath}' has not been written. Call writeFile with the full HTML content RIGHT NOW.`,
          }),
        });
        continue;
      }

      log("OUTPUT", c.green, parsed.content);
      console.log(
        `\n${c.bold}${c.green}✓ Agent finished in ${iterations} step(s).${c.reset}`,
      );
      console.log(`${c.bold}${c.cyan}→ Open: ${outputPath}${c.reset}\n`);
      break;
    } else {
      log("UNKNOWN STEP", c.red, JSON.stringify(parsed));
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    log("LIMIT", c.red, `Reached maximum iteration limit (${MAX_ITERATIONS}).`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error(
      `${c.red}${c.bold}ERROR:${c.reset} GROQ_API_KEY is not set.\n` +
        `Add it to your .env file:\n  GROQ_API_KEY=gsk_xxxxxxxxxxxx\n` +
        `Get a free key at: https://console.groq.com/keys`,
    );
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(
    `\n${c.bold}${c.cyan}╔══════════════════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.bold}${c.cyan}║         Website Cloner Agent CLI             ║${c.reset}`,
  );
  console.log(
    `${c.bold}${c.cyan}╚══════════════════════════════════════════════╝${c.reset}`,
  );
  console.log(
    `${c.gray}Enter the URL of the website you want to clone.${c.reset}`,
  );
  console.log(`${c.gray}Example: https://www.scaler.com${c.reset}\n`);

  while (true) {
    const userInput = await promptUser(
      rl,
      `${c.bold}${c.cyan}Enter URL › ${c.reset}`,
    );
    const trimmed = userInput.trim();

    if (!trimmed) continue;

    if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
      console.log(`\n${c.gray}Goodbye!${c.reset}\n`);
      rl.close();
      break;
    }

    let url = trimmed;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    try {
      new URL(url);
    } catch {
      log(
        "ERROR",
        c.red,
        "Invalid URL. Please enter a valid URL like https://www.scaler.com",
      );
      continue;
    }

    try {
      await runAgent(url);
    } catch (err) {
      log("FATAL ERROR", c.red, err.message);
    }
  }
}

main();