import * as commander from 'commander';

export function mergeOllamaHeaderFlags(
  existingHeadersJson: string | undefined,
  cliHeaders: Record<string, string>
): string {
  const existing = existingHeadersJson ? JSON.parse(existingHeadersJson) : {};
  return JSON.stringify({ ...existing, ...cliHeaders });
}

export function collectHeader(value: string, previous: Record<string, string>): Record<string, string> {
  const eqIndex = value.indexOf('=');
  if (eqIndex === -1) {
    throw new commander.InvalidArgumentError(`Expected key=value, got "${value}"`);
  }
  const key = value.slice(0, eqIndex);
  const val = value.slice(eqIndex + 1);
  return { ...previous, [key]: val };
}
