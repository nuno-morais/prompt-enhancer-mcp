#!/usr/bin/env node
import * as commander from 'commander';
import { handleOptimizePrompt } from '../tool-handler.js';
import { handleLintPrompt } from '../lint-tool.js';
import { handleScorePrompt } from '../score.js';
import { loadPreset } from '../preset.js';
import { readFileSync } from 'node:fs';
import { mergeOllamaHeaderFlags, collectHeader } from './ollama-flags.js';
import { SAMPLING_UNSUPPORTED_MESSAGE } from '../sampling-client.js';
import { installSkill } from './skills-install.js';

async function getStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => (data += chunk));
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

export function buildProgram(): commander.Command {
  const program = new commander.Command();
  program
    .name('mcp')
    .description('Optimize a prompt draft using the local MCP')
    .option('-d, --draft <draft>', 'Prompt draft string (if omitted, reads from stdin)')
    .option('-b, --brainstorm', 'Enable brainstorming mode')
    .option('-e, --explain', 'Include a one‑line explanation of changes')
    .option('-t, --target <model>', 'Target model (generic, claude, gpt4o, gemini)')
    .option('-m, --model <ollama>', 'Override Ollama model name')
    .option('-u, --ollama-url <url>', 'Override Ollama base URL (e.g. https://your-ollama-host.example.com)')
    .option('-H, --ollama-header <key=value>', 'Extra header to send to Ollama (repeatable)', collectHeader, {})
    .option('-s, --session <id>', 'Session ID to maintain conversation state across calls')
    .option('--no-cot', 'Disable automatic Chain-of-Thought injection')
    .option('--no-guardrails', 'Disable automatic negative-constraint (guardrail) injection')
    .option('--no-auto-intent', 'Disable automatic intent classification (web-search/artifact hints and auto-brainstorm)')
    .option('--no-auto-repair', 'Disable automatic repair of lint findings')
    .option('--stats', 'Include token count and efficiency stats in the output')
    .option('--engine <engine>', 'LLM engine to use (ollama, anthropic or sampling — sampling only works inside an MCP client)')
    .enablePositionalOptions()
    // no-op: commander v12 requires a root action once subcommands exist
    .action(() => {});

  program
    .command('lint')
    .description('Lint a prompt for common issues (no LLM call)')
    .argument('[prompt]', 'Prompt text (if omitted, reads from stdin)')
    .option('--draft <draft>', 'Original draft, enables draft-comparison rules')
    .option('--context <context>', 'Background context the prompt was built from')
    .action(async (promptArg: string | undefined, cmdOpts: any) => {
      const prompt = promptArg ?? (await getStdin());
      if (!prompt) {
        console.error('Error: No prompt provided.');
        process.exit(1);
      }
      const res = handleLintPrompt({ prompt, draft: cmdOpts.draft, context: cmdOpts.context });
      console.log(res.content[0].text);
      process.exit(res.content[0].text.startsWith('No lint issues') ? 0 : 1);
    });

  program
    .command('score')
    .description('Judge-grade a prompt (1-5 on five dimensions); --baseline compares two prompts')
    .argument('[prompt]', 'Prompt to score (if omitted, reads from stdin)')
    .option('--baseline <prompt>', 'Second prompt for comparison mode')
    .option('--engine <engine>', 'LLM engine (ollama or anthropic)')
    .option('-m, --model <model>', 'Override judge model')
    .action(async (promptArg: string | undefined, cmdOpts: any) => {
      const prompt = promptArg ?? (await getStdin());
      if (!prompt) { console.error('Error: No prompt provided.'); process.exit(1); }
      try {
        const res = await handleScorePrompt({ prompt, baseline: cmdOpts.baseline, engine: cmdOpts.engine, model: cmdOpts.model });
        console.log(res.content[0].text);
      } catch (e) { console.error('Scoring failed:', e); process.exit(1); }
    });

  const skillsCmd = program
    .command('skills')
    .description('Manage Claude Code skills bundled with this package');

  skillsCmd
    .command('install')
    .description('Install the draft-prompt skill (default: ~/.claude/skills, or --project for ./.claude/skills)')
    .option('--project', 'Install into the current project instead of the user home directory')
    .action((cmdOpts: any) => {
      try {
        const dest = installSkill({ project: cmdOpts.project });
        console.log(`Installed draft-prompt skill to ${dest}`);
      } catch (e) {
        console.error('Skill install failed:', e);
        process.exit(2);
      }
    });

  return program;
}

export function parseOpts(argv: string[]): any {
  const program = buildProgram();
  program.parse(argv);
  return program.opts();
}

export function buildArgs(opts: any, draft: string) {
  return {
    draft,
    brainstorm: opts.brainstorm ? true : undefined,
    explain: !!opts.explain,
    target_model: opts.target,
    model: opts.model,
    session_id: opts.session,
    auto_cot: opts.cot,
    auto_guardrails: opts.guardrails,
    auto_intent: opts.autoIntent,
    auto_repair: opts.autoRepair,
    show_stats: !!opts.stats,
    engine: opts.engine,
  };
}

export async function main(argv: string[]): Promise<void> {
  const program = buildProgram();
  const subcommandNames = program.commands.map((c) => c.name());
  if (argv[2] && subcommandNames.includes(argv[2])) {
    await program.parseAsync(argv);
    return;
  }

  const opts = parseOpts(argv);

  if (opts.engine === 'sampling') {
    console.error(SAMPLING_UNSUPPORTED_MESSAGE);
    process.exit(1);
  }

  if (opts.ollamaUrl) {
    process.env.OLLAMA_BASE_URL = opts.ollamaUrl;
  }
  if (opts.ollamaHeader && Object.keys(opts.ollamaHeader).length > 0) {
    process.env.OLLAMA_EXTRA_HEADERS = mergeOllamaHeaderFlags(
      process.env.OLLAMA_EXTRA_HEADERS,
      opts.ollamaHeader
    );
  }

  const draft = opts.draft ?? (await getStdin());
  if (!draft) {
    console.error('Error: No draft provided. Use --draft or pipe input.');
    process.exit(1);
  }
  const args = buildArgs(opts, draft);
  try {
    const result = await handleOptimizePrompt(args);
    // result.content is an array of text blocks
    result.content.forEach((block: any) => {
      if (block.type === 'text') console.log(block.text);
    });
  } catch (e) {
    console.error('Optimization failed:', e);
    process.exit(1);
  }
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main(process.argv);
}
