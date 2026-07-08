# Prompt Enhancer MCP

Local MCP server that uses a local Ollama model as a "Prompt Engineer" to
rewrite rough prompt drafts into structured, optimized prompts before you
send them to a paid API (Claude, GPT-4o, etc.) — saving tokens and improving
output quality on the paid model.

Every request runs a self-critique pipeline (generate a first draft, then
have the local model critique and refine it) unless the draft is trivial
enough to skip the critique pass. Optional features layer on top: multi-persona
brainstorming, a 1-line summary of what the critic changed, an in-memory
response cache, and per-project default presets.

**Model Agnostic:** The server supports both local execution via **Ollama** (Llama 3, Mistral, Qwen, Phi, etc.) and cloud execution via the **Anthropic API** (Claude 3.5 Haiku, Sonnet, etc.). You can configure the engine and model per project or per request!

## Prerequisites

- Node.js 20+
- **Option A (Local Ollama):** [Ollama](https://ollama.com) running locally with a model pulled, e.g.:
  ```bash
  ollama pull qcwind/qwen2.5-7B-instruct-Q4_K_M
  ```
- **Option B (Remote Ollama):** Ollama running on a machine you control (e.g. a home server exposed through a tunnel), with `OLLAMA_BASE_URL` (and optionally `OLLAMA_EXTRA_HEADERS` for an authenticating proxy) pointed at it. See [Remote Ollama endpoint](#remote-ollama-endpoint) below. Useful when local model execution isn't available on your machine (e.g. a locked-down company laptop).
- **Option C (Cloud):** An Anthropic API Key (`ANTHROPIC_API_KEY` environment variable). Useful when neither local nor remote Ollama is an option.

## Local Development

If you want to clone and modify the server locally:

```bash
npm install
npm run build
npm test
```

`npm run build` compiles `src/` to `dist/index.js`. You can then run it via `node dist/index.js`.

## CLI Usage

The package ships a global `mcp` command that you can use from the terminal.
See the full reference in **[docs/cli.md](docs/cli.md)**.

## Register with an MCP client

You do not need to clone the repository to use this MCP server. You can run it directly via `npx`.

All MCP clients register a server the same way. Below are the exact config file and key for each client this server has been used with.

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "prompt-enhancer": {
      "command": "npx",
      "args": [
        "-y",
        "--package=@nuno-morais/prompt-enhancer-mcp@latest",
        "prompt-enhancer-mcp"
      ]
    }
  }
}
```

Restart Claude Desktop for the change to take effect.

### Claude Code

Add the same block to Claude Code's MCP settings (`.claude/settings.json` or via `claude mcp add`, depending on your Claude Code version):

```json
{
  "mcpServers": {
    "prompt-enhancer": {
      "command": "npx",
      "args": [
        "-y",
        "--package=@nuno-morais/prompt-enhancer-mcp@latest",
        "prompt-enhancer-mcp"
      ]
    }
  }
}
```

### Antigravity CLI / Gemini CLI

Both use the same config file and key: `~/.gemini/settings.json`.

```json
{
  "mcpServers": {
    "prompt-enhancer": {
      "command": "npx",
      "args": [
        "-y",
        "--package=@nuno-morais/prompt-enhancer-mcp@latest",
        "prompt-enhancer-mcp"
      ]
    }
  }
}
```

If the file already has an `"mcpServers"` object with other servers in it,
add `"prompt-enhancer"` as a new key inside it rather than replacing the file.

Restart the CLI session after editing.

### Cursor

Navigate to `Cursor Settings` -> `Features` -> `MCP` -> `Add new MCP server`.
- **Name**: `prompt-enhancer`
- **Type**: `command`
- **Command**: `npx -y --package=@nuno-morais/prompt-enhancer-mcp@latest prompt-enhancer-mcp`

Click "Add" and ensure the green light indicates a successful connection.

### PI.dev, Zed, or Any Other MCP Client

Since this tool uses the standard Model Context Protocol, it can be connected to any IDE or agent that acts as an MCP client. If your client requires a JSON configuration (like Zed or PI.dev configurations), the pattern is typically the same:

```json
{
  "mcpServers": {
    "prompt-enhancer": {
      "command": "npx",
      "args": [
        "-y",
        "--package=@nuno-morais/prompt-enhancer-mcp@latest",
        "prompt-enhancer-mcp"
      ]
    }
  }
}
```

If your client provides a UI to add tools instead of a configuration file, use the equivalent shell command: `npx -y --package=@nuno-morais/prompt-enhancer-mcp@latest prompt-enhancer-mcp`.

## Calling the tools

The server exposes three tools: `optimize_prompt`, `lint_prompt`, and `score_prompt`.

### optimize_prompt

Optimizes a rough prompt draft using a local LLM before sending it to a paid API.

```json
{
  "draft": "quero um resumo do texto mas curto",
  "context": "MCP in this project means Model Context Protocol server",
  "target_model": "claude",
  "brainstorm": false,
  "explain": false,
  "session_id": "my-iteration-1",
  "auto_cot": true,
  "auto_guardrails": true,
  "auto_intent": true,
  "auto_repair": true,
  "show_stats": true,
  "show_diff": false,
  "engine": "ollama",
  "model": "llama3.1:8b"
}
```

Only `draft` is required — every other field has a default.

### lint_prompt

Checks any prompt for common issues without making LLM calls. Detects unresolved placeholders (`{{placeholder}}`), suspect acronym expansions (against the glossary), and leaked meta-commentary.

```json
{
  "prompt": "Here is the optimized prompt.",
  "draft": "Original draft text (optional; enables draft-comparison rules)",
  "context": "Background context (optional)"
}
```

Only `prompt` is required. When `draft` is provided, lint runs acronym expansion checks.

### score_prompt

Judge-grades a prompt 1-5 on five dimensions: clarity, specificity, structure, guardrails, and token efficiency. Pass `baseline` to switch to comparison mode.

```json
{
  "prompt": "The prompt to score",
  "baseline": "Optional second prompt for comparison mode",
  "engine": "ollama",
  "model": "llama3.1:8b"
}
```

Only `prompt` is required. Comparison mode shows per-dimension deltas and a winner verdict.

## HTTP API

The optimizer can be accessed over HTTP, which is handy for scripts, editors, or any tool that can issue a simple `curl` request.

```bash
curl -X POST http://localhost:3000/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "draft": "quero um resumo do texto mas curto",
    "target_model": "claude",
    "brainstorm": false,
    "explain": false
  }'
```

The response is a JSON object with a `content` array, exactly like the MCP tool returns. Example response:

```json
{
  "content": [
    { "type": "text", "text": "<optimized‑prompt>" },
    { "type": "text", "text": "<optional‑explanation>" }
  ]
}
```

Set the port with the `MCP_HTTP_PORT` environment variable (default `3000`). The endpoint is `POST /optimize`. No authentication or rate‑limit is applied – it is intended for local development use only.

| Field | Type | Default | Description |
|---|---|---|---|
| `draft` | string | — (required) | The rough idea to turn into an optimized prompt. |
| `target_model` | `"generic"` \| `"claude"` \| `"gpt4o"` \| `"gemini"` | `"generic"` | Which API/format the optimized prompt is written for — `claude` and `gemini` use XML tags (per Google's own Gemini prompting guidance), `gpt4o` requests a JSON response, `generic` is plain-language. |
| `brainstorm` | boolean | `false` | When true, the optimized prompt instructs the target model to answer via multiple distinct personas/perspectives (useful for open-ended ideation). |
| `explain` | boolean | `false` | When true, the response includes a 2nd text block: a 1-line summary of what the critic pass changed. |
| `auto_cot` | boolean | `true` | Automatically injects a `<thinking>` block tailored to the `target_model` for complex requests, improving reasoning. |
| `auto_guardrails` | boolean | `true` | Automatically detects potential hallucination risks and injects a strict `<negative_constraints>` block (`DO NOT...`). |
| `auto_intent` | boolean | `true` | Classifies the draft's intent and injects a matching instruction line ("search the web…", "ask the user for {{artifact}}…"). When `brainstorm` is not set, an ideation draft auto-enables brainstorm mode. |
| `auto_repair` | boolean | `true` | Automatically fixes repairable lint findings (e.g. wrong acronym expansions covered by the glossary) with one extra critic pass. Unfixable findings are still surfaced as warnings. |
| `show_stats` | boolean | `false` | Returns an additional text block detailing token expansion and efficiency metrics. |
| `interactive` | boolean | `true` | When true, instructs the MCP client NOT to answer the optimized prompt immediately, but instead present it to the user for approval. |
| `engine` | `"ollama"` \| `"anthropic"` \| `"sampling"` | `"ollama"` | Choose the backend engine. If using `anthropic`, you must set the `ANTHROPIC_API_KEY` environment variable. The `sampling` engine is opt-in and only available when connected to an MCP client that advertises the sampling capability; see [Sampling engine](#sampling-engine) below. |
| `model` | string | `qcwind/qwen...` | Override which model runs the pipeline. If `engine` is `anthropic`, defaults to `claude-3-5-haiku-latest`, but you can explicitly set it to `claude-3-5-sonnet-latest` or any other valid model! |

The response is an MCP `content` array: one text block with the optimized
prompt, plus a second text block when `explain: true`.

## Configuration

### Remote Ollama endpoint

By default, the server talks to Ollama at `http://localhost:11434`. To point it at a remote Ollama instance instead — for example, one exposed through a Cloudflare Tunnel or reverse proxy from a machine you control — set:

- `OLLAMA_BASE_URL` — the base URL of the remote Ollama instance, e.g. `https://your-ollama-host.example.com`. Defaults to `http://localhost:11434`.
- `OLLAMA_EXTRA_HEADERS` — a JSON object of extra HTTP headers to send with every Ollama request, e.g. `{"CF-Access-Client-Id":"...","CF-Access-Client-Secret":"..."}` if the endpoint sits behind an authenticating proxy such as Cloudflare Access. Defaults to no extra headers.

For the MCP server itself, set these in the `env` block of your MCP host's server configuration (e.g. `.mcp.json`):

```json
{
  "mcpServers": {
    "prompt-enhancer": {
      "command": "prompt-enhancer-mcp",
      "env": {
        "OLLAMA_BASE_URL": "https://your-ollama-host.example.com",
        "OLLAMA_EXTRA_HEADERS": "{\"CF-Access-Client-Id\":\"...\",\"CF-Access-Client-Secret\":\"...\"}"
      }
    }
  }
}
```

For the standalone `mcp` CLI tool, use flags instead (these take precedence over the env vars above):

```bash
mcp --draft "quick note" --ollama-url https://your-ollama-host.example.com \
  --ollama-header "CF-Access-Client-Id=..." \
  --ollama-header "CF-Access-Client-Secret=..."
```

### Sampling engine

The `sampling` engine is an optional third choice that uses the connected MCP client's own model via MCP sampling, instead of Ollama or Anthropic. It is **opt-in only** — set `engine: "sampling"` in your `.prompt-enhancer.json` preset or pass it to the MCP tool directly. The connected MCP client must advertise the sampling capability for this to work.

**Important:** the `sampling` engine is **not available from the CLI**. If you try to use `--engine sampling` with the `mcp` command-line tool, it will exit with an error. Use it only when calling `optimize_prompt` as an MCP tool from a supporting client (Claude Desktop, Claude Code, etc.).

You can check if the connected client supports sampling by calling the `check_health` tool — it will report whether the capability is available.

## Behavior you should know about

- **Self-critique pipeline:** every non-trivial request makes 2 Ollama calls
  (draft, then critique/refine); `explain: true` adds a 3rd. A trivial draft
  (`target_model: "generic"`, `brainstorm: false`, ≤15 words) skips the
  critique call entirely — 1 call instead of 2.
- **Output lint:** every response is checked (no extra LLM calls) for
  unresolved `{{placeholders}}`, acronym expansions not supported by your
  draft/context, and leaked meta-commentary. Problems are appended as a
  `⚠️ Prompt lint warnings` block instead of silently shipping a broken prompt.
- **Auto-repair:** when `auto_repair: true` (the default), `optimize_prompt` automatically fixes repairable lint findings (such as wrong acronym expansions covered by your `glossary`) with one extra critic pass. Unfixable findings are still surfaced as warnings. You can disable this with `auto_repair: false` or the `--no-auto-repair` CLI flag.
- **Response cache:** identical requests (same `draft` + `target_model` +
  `brainstorm` + `explain` + `model`) are cached in memory for 1 hour
  (100-entry LRU). A cache hit returns instantly with zero Ollama calls.
- **Intent classification:** unless `auto_intent: false`, classification tags
  each draft as needing web search, a user-provided artifact, brainstorming,
  or nothing. It runs in parallel with the first draft when `brainstorm` is
  explicitly set; when `brainstorm` is left unset (the default), it runs
  sequentially before the first draft, since its result determines whether
  brainstorm mode is used. Web-search/artifact intents add one instruction
  line to the optimized prompt; an ideation draft auto-enables brainstorm mode
  when you didn't set `brainstorm` yourself. Explicit `brainstorm` (argument
  or preset) always wins. Wrong classifications are harmless: the line is
  advisory prose, and any failure falls back to injecting nothing. Session
  (`session_id`) refinement calls never re-classify.
- **Project presets:** drop a `.prompt-enhancer.json` file anywhere in your
  project (the server searches upward from its working directory to find
  it, like `.eslintrc`) to set project-wide defaults.

  For Ollama:
  ```json
  { "target_model": "claude", "explain": true, "show_stats": true, "model": "mistral" }
  ```

  For Anthropic (e.g. upgrading from Haiku to Sonnet):
  ```json
  { "engine": "anthropic", "model": "claude-3-5-sonnet-latest", "target_model": "claude", "explain": true, "show_stats": true }
  ```
  
  With a glossary (authoritative term definitions for lint and auto-repair):
  ```json
  { "target_model": "claude", "explain": true, "glossary": { "MCP": "Model Context Protocol", "LLM": "Large Language Model" } }
  ```
  
  Any parameter can be set this way. An explicit argument in a tool call always overrides the preset.
  
  **Glossary:** the `glossary` key lets you define authoritative meanings for acronyms and terms in your project. When set, `lint_prompt` will flag acronym expansions that don't match the glossary, and `optimize_prompt` with `auto_repair: true` (the default) will automatically fix wrong expansions on a second pass. Example: `{"glossary": {"MCP": "Model Context Protocol"}}`.
- **Diff view:** `show_diff: true` appends a line diff showing exactly what
  the self-critique pass changed between the first draft and the final
  prompt. Computed locally — no extra LLM calls. For trivial drafts (critic
  skipped) it reports that no diff is available.
- **Background Processes (Zero-Cost Latency):** `auto_cot` and `auto_guardrails` are executed asynchronously in parallel with the first draft generation, causing **zero extra wait time**.
- **Progress notifications:** if your MCP client attaches a `progressToken`
  to its `tools/call` request, the server sends `notifications/progress`
  updates as the pipeline advances through its stages. Clients that don't
  ask for this see no behavior change.
- **Domain context:** pass `context` with a sentence or two of background
  (glossary, project description) whenever the draft contains ambiguous or
  domain-specific terms. The local model uses it only to interpret the draft
  — it is never rewritten into the output. Without it, small local models
  will guess what acronyms mean.
- **Iterating on a prompt:** pass a `session_id` on the first call, then call
  again with the same `session_id` and your feedback as the new `draft`
  ("make it shorter", "the MCP here is Model Context Protocol"). The server
  keeps the conversation and refines the previous prompt instead of starting
  over. Session requests always bypass the response cache.

## Manual testing

`test-manual.sh` drives the server over raw JSON-RPC on stdio (MCP doesn't
speak HTTP, so `curl` won't work here):

```bash
./test-manual.sh "<draft>" [target_model] [brainstorm] [explain]
```

Examples:

```bash
# Defaults (generic, no brainstorm, no explain)
./test-manual.sh "quero um resumo curto do texto"

# Claude-formatted, with the change-summary block
./test-manual.sh "I want a detailed and comprehensive summary of this long article covering many different topics in depth" claude false true

# Brainstorm mode
./test-manual.sh "preciso de ideias para o nome de uma nova cafetaria" generic true
```
