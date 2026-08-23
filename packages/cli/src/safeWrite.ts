import { randomBytes } from 'node:crypto';
import { existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Write a CLI artifact without exposing a partial or failed replacement. */
export function writeFileAtomically(filePath: string, data: string | Buffer, encoding?: BufferEncoding): void {
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomBytes(8).toString('hex')}.tmp`);
  try {
    writeFileSync(temporaryPath, data, encoding);
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }
}
