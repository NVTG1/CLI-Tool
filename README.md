# 🤖 Website Cloner Agent CLI

An AI-powered CLI agent that clones websites by generating fully working HTML/CSS/JS files — built as a conversational terminal tool using the **START → THINK → TOOL → OBSERVE → OUTPUT** agentic loop.

---

## 📌 Assignment

**Course:** AI Agent CLI Tool — Assignment 02  
**Objective:** Build a conversational CLI agent (similar to Cursor/Windsurf) that accepts natural language instructions, reasons through them step-by-step, and produces a working clone of the Scaler Academy website.

---

## 🚀 Demo

> 📹 [YouTube Demo Video](#) — *(https://youtu.be/Mq79ejD7eVk)*  
> 💻 [GitHub Repository](#) — *(https://github.com/NVTG1/CLI-Tool)*

---

## ✨ Features

- 🔄 **Agentic loop** — multi-step reasoning across START → THINK → TOOL → OBSERVE → OUTPUT
- 🌐 **Live website fetching** — scrapes real colors, fonts, nav labels, and hero copy from the target URL
- 🎨 **Faithful clone** — responsive HTML/CSS/JS that mirrors the real site's palette and layout
- 📱 **Fully responsive** — works on mobile (320px), tablet (768px), and desktop (1280px+)
- 🔗 **Safe links** — all clicks stay on the clone; no redirects to the real site
- 🔁 **Auto-retry** — handles Groq rate limits, connection errors, and server failures with exponential backoff
- 💬 **Interactive CLI** — accepts any URL, loops until you type `exit`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| LLM | `llama-3.3-70b-versatile` via [Groq](https://groq.com) |
| HTTP | `node-fetch` |
| File I/O | Node.js `fs/promises` |
| CLI | Node.js `readline` |
| Config | `dotenv` |

---

## 📁 Project Structure

```
.
├── index.js          # Main agent — all tools, loop, and CLI
├── .env              # API keys (never commit this)
├── .env.example      # Template for environment variables
├── package.json
└── <sitename>_clone/
    └── index.html    # Generated output file
```

---

## ⚙️ Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/NVTG1/CLI-Tool.git
cd CLI-Tool
```

### 2. Install dependencies

```bash
npm install
```

### 3. Get a free Groq API key

Sign up at [https://console.groq.com/keys](https://console.groq.com/keys).

### 4. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` and add your key:

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
```

### 5. Run the agent

```bash
node index.js
```

---

## 💻 Usage

Once running, the CLI will prompt you for a URL:

```
╔══════════════════════════════════════════════╗
║         Website Cloner Agent CLI             ║
╚══════════════════════════════════════════════╝

Enter URL › https://www.scaler.com
```

The agent will then:

1. **THINK** — plan the clone strategy
2. **TOOL: fetchWebsite** — scrape the real HTML for colors, fonts, and copy
3. **TOOL: createDirectory** — create `scaler_clone/`
4. **TOOL: writeFile** — generate and write the full `index.html`
5. **OUTPUT** — confirm the file path and finish

Open the output file in your browser:

```bash
open scaler_clone/index.html       # macOS
xdg-open scaler_clone/index.html   # Linux
start scaler_clone/index.html      # Windows
```

Type `exit` or `quit` to stop the CLI.

---

## 🧠 How the Agent Loop Works

The agent follows a strict single-step-at-a-time JSON protocol:

```
{"step":"START",   "content":"..."} 
{"step":"THINK",   "content":"..."}
{"step":"TOOL",    "tool_name":"fetchWebsite", "tool_args":"https://..."}
{"step":"OBSERVE", "content":"<html from site>"}
{"step":"TOOL",    "tool_name":"writeFile",    "tool_args":{"filepath":"...","content":"..."}}
{"step":"OBSERVE", "content":"File written successfully"}
{"step":"OUTPUT",  "content":"Done!"}
```

Guardrails enforce this — the agent **cannot** reach OUTPUT unless:
- `fetchWebsite` was called and succeeded
- `writeFile` was called and confirmed as written

---

## 🧰 Available Tools

| Tool | Description |
|---|---|
| `fetchWebsite(url)` | Fetches and cleans HTML from the target URL |
| `createDirectory(path)` | Creates a directory (recursive) |
| `writeFile({filepath, content})` | Writes content to a file |
| `readFile(filepath)` | Reads a file's contents |
| `executeCommand(cmd)` | Runs a shell command |
| `listDirectory(path)` | Lists files in a directory |

---

## 🔁 Error Handling & Retry Logic

| Error Type | Detection | Behaviour |
|---|---|---|
| Rate limit (429) | `err.status === 429` | Waits for `retry-after` header, then retries |
| Connection error | `ECONNRESET`, `ENOTFOUND`, `ETIMEDOUT`, or message contains "connection"/"network" | Exponential backoff: 4s → 16s → 60s |
| Server error (5xx) | `err.status >= 500` | Exponential backoff: 10s → 20s → 40s → 60s |

All retryable errors retry up to **5 times** before failing.

---

## 📋 Output — What Gets Generated

The cloned `index.html` includes:

- **Header** with logo, nav links, and CTA button
- **Hero section** with real headline, tagline, and CTA
- **2+ feature/content sections** matching the site's purpose
- **Footer** with links and copyright
- All links use `onclick="showPage('...')"` — clicking shows a placeholder, never redirects to the real site
- Google Fonts CDN, CSS variables, hover effects, fade-in animations

---

## 📦 Dependencies

```json
{
  "groq-sdk": "^0.x",
  "node-fetch": "^3.x",
  "dotenv": "^16.x"
}
```

Install with:

```bash
npm install groq-sdk node-fetch dotenv
```
