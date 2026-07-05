#!/usr/bin/env node
import * as commander from 'commander';
import { handleOptimizePrompt } from '../tool-handler.js';
import { loadPreset } from '../preset.js';
import { readFileSync } from 'node:fs';

const program = new commander.Command();
program
  .name('mcp')
  .description('Optimize a prompt draft using the local MCP')
  .option('-d, --draft <draft>', 'Prompt draft string (if omitted, reads from stdin)')
  .option('-b, --brainstorm', 'Enable brainstorming mode')
  .option('-e, --explain', 'Include a one‑line explanation of changes')
  .option('-t, --target <model>', 'Target model (generic, claude, gpt4o, gemini)')
  .option('-m, --model <ollama>', 'Override Ollama model name')
  .parse(process.argv);

async function getStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => (data += chunk));
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

(async () => {
  const opts = program.opts();
  const draft = opts.draft ?? (await getStdin());
  if (!draft) {
    console.error('Error: No draft provided. Use --draft or pipe input.');
    process.exit(1);
  }
  const args = {
    draft,
    brainstorm: !!opts.brainstorm,
    explain: !!opts.explain,
    target_model: opts.target,
    model: opts.model,
  };
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
})();
