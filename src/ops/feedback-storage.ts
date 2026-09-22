/**
 * Feedback ekran görüntüsü depolama (disk).
 */
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';

export const FEEDBACK_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_UPLOAD_MAX_FILES = 3;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function feedbackUploadRoot(): string {
  return join(process.cwd(), 'data', 'feedback-uploads');
}

export function ensureUploadDir(): void {
  const root = feedbackUploadRoot();
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true, mode: 0o750 });
  }
}

export function detectImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 12
    && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

export function extensionForMime(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.bin';
}

export function saveFeedbackImage(buf: Buffer, mime: string): string {
  ensureUploadDir();
  const key = `${randomUUID()}${extensionForMime(mime)}`;
  writeFileSync(join(feedbackUploadRoot(), key), buf, { mode: 0o640 });
  return key;
}

export function feedbackFilePath(storageKey: string): string {
  const safe = storageKey.replace(/[^a-zA-Z0-9._-]/g, '');
  return join(feedbackUploadRoot(), safe);
}

export function streamFeedbackFile(storageKey: string, res: ServerResponse, mimeType: string): boolean {
  const path = feedbackFilePath(storageKey);
  if (!existsSync(path)) return false;
  res.writeHead(200, {
    'Content-Type': mimeType,
    'Cache-Control': 'private, max-age=3600',
  });
  createReadStream(path).pipe(res);
  return true;
}

export function isAllowedUploadMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

/** Minimal multipart/form-data parser — single file field "file". */
export async function parseMultipartFile(
  req: import('node:http').IncomingMessage,
  maxBytes: number,
): Promise<{ buffer: Buffer; mime: string; filename: string } | null> {
  const contentType = req.headers['content-type'] ?? '';
  const boundaryMatch = /boundary=(.+)$/i.exec(contentType);
  if (!contentType.includes('multipart/form-data') || !boundaryMatch) {
    return null;
  }
  const boundary = boundaryMatch[1]!.replace(/^"|"$/g, '');
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > maxBytes + 65536) {
      throw new Error('Dosya çok büyük (max 5 MB).');
    }
    chunks.push(buf);
  }
  const body = Buffer.concat(chunks);
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = splitMultipart(body, delimiter);
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;
    const headerText = part.slice(0, headerEnd).toString('utf8');
    if (!headerText.includes('name="file"')) continue;
    const filenameMatch = /filename="([^"]*)"/i.exec(headerText);
    const contentTypeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);
    let data = part.slice(headerEnd + 4);
    if (data.slice(-2).equals(Buffer.from('\r\n'))) {
      data = data.slice(0, -2);
    }
    if (data.length > maxBytes) {
      throw new Error('Dosya çok büyük (max 5 MB).');
    }
    const detected = detectImageMime(data);
    const mime = detected ?? contentTypeMatch?.[1]?.trim() ?? '';
    if (!detected || !isAllowedUploadMime(mime)) {
      throw new Error('Sadece JPEG, PNG veya WebP yükleyebilirsin.');
    }
    return {
      buffer: data,
      mime: detected,
      filename: filenameMatch?.[1] ?? 'upload',
    };
  }
  return null;
}

function splitMultipart(body: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  while (true) {
    const idx = body.indexOf(delimiter, start);
    if (idx < 0) break;
    const next = body.indexOf(delimiter, idx + delimiter.length);
    if (next < 0) break;
    let sliceStart = idx + delimiter.length;
    if (body.slice(sliceStart, sliceStart + 2).equals(Buffer.from('\r\n'))) {
      sliceStart += 2;
    }
    let sliceEnd = next;
    if (body.slice(sliceEnd - 2, sliceEnd).equals(Buffer.from('\r\n'))) {
      sliceEnd -= 2;
    }
    if (sliceEnd > sliceStart) {
      parts.push(body.slice(sliceStart, sliceEnd));
    }
    start = next;
  }
  return parts;
}
