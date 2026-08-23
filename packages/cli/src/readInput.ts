import { readFileSync } from 'node:fs';

export function readFileUtf8(filePath: string): string {
  try {
    return readFileSync(filePath === '-' ? 0 : filePath, 'utf8');
  } catch (err) {
    throw new Error(`cannot read ${filePath === '-' ? 'stdin' : `file "${filePath}"`}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
