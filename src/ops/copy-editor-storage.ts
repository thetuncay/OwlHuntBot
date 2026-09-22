import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(process.cwd(), 'data');
const OVERRIDES_PATH = join(DATA_DIR, 'copy-overrides.json');

export interface CopyOverridesFile {
  version: 1;
  updatedAt: string;
  /** entryId → Cursor agent notu (talimat / yorum) */
  overrides: Record<string, string>;
  _readme?: string;
}

function emptyFile(): CopyOverridesFile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    overrides: {},
    _readme: 'overrides: entryId → agent notu. JSON dosyasını Cursor\'a ver; notlara göre bota uygular.',
  };
}

export function readCopyOverrides(): CopyOverridesFile {
  if (!existsSync(OVERRIDES_PATH)) return emptyFile();
  try {
    const raw = readFileSync(OVERRIDES_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CopyOverridesFile;
    if (parsed?.version === 1 && parsed.overrides && typeof parsed.overrides === 'object') {
      return parsed;
    }
  } catch {
    /* corrupt file — start fresh */
  }
  return emptyFile();
}

export function writeCopyOverrides(overrides: Record<string, string>): CopyOverridesFile {
  mkdirSync(DATA_DIR, { recursive: true });
  const file: CopyOverridesFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    overrides,
    _readme: 'overrides: entryId → agent notu. JSON dosyasını Cursor\'a ver; notlara göre bota uygular.',
  };
  writeFileSync(OVERRIDES_PATH, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  return file;
}

export function getOverridesPath(): string {
  return OVERRIDES_PATH;
}
