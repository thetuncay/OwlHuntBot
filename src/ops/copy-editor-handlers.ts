/**
 * Copy Editor API — bot metin kataloğu + kullanıcı düzeltmeleri.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildCopyCatalog, filterUserFacingOutputs, getCopyCatalogMeta } from '../config/copy-catalog';
import { attachContextToEntries } from '../config/copy-entry-context';
import { readCopyOverrides, writeCopyOverrides } from './copy-editor-storage';
import { serveDuelCardPreview } from './copy-editor-duel-preview';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

export function requiresCopyEditorAuth(path: string): boolean {
  return path === '/admin/copy'
    || path === '/admin/copy/'
    || path.startsWith('/admin/copy.')
    || path.startsWith('/api/admin/copy/');
}

export async function handleCopyEditorRequest(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
): Promise<boolean> {
  if (path === '/api/admin/copy/catalog' || path === '/api/admin/copy/catalog/') {
    const allEntries = buildCopyCatalog();
    const outputsOnly = !req.url?.includes('all=1');
    const entries = outputsOnly
      ? attachContextToEntries(filterUserFacingOutputs(allEntries))
      : attachContextToEntries(allEntries);
    const overrides = readCopyOverrides().overrides;
    sendJson(res, 200, {
      entries,
      overrides,
      meta: { ...getCopyCatalogMeta(allEntries), shown: entries.length, outputsOnly },
      overridesPath: 'data/copy-overrides.json',
      bot: {
        name: process.env.BOT_DISPLAY_NAME?.trim() || 'OwlHunt',
        avatarUrl: '/assets/owlhuntweb/07_developer.png',
      },
    });
    return true;
  }

  if (path === '/api/admin/copy/preview/duel-card.png') {
    await serveDuelCardPreview(res);
    return true;
  }

  if (path === '/api/admin/copy/overrides' || path === '/api/admin/copy/overrides/') {
    if (req.method === 'GET') {
      const file = readCopyOverrides();
      sendJson(res, 200, file);
      return true;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'invalid_json' });
        return true;
      }
      const incoming = (body as { overrides?: Record<string, string> })?.overrides;
      if (!incoming || typeof incoming !== 'object') {
        sendJson(res, 400, { error: 'overrides_object_required' });
        return true;
      }
      const cleaned: Record<string, string> = {};
      for (const [id, text] of Object.entries(incoming)) {
        if (typeof text !== 'string') continue;
        const trimmed = text.trim();
        if (trimmed) cleaned[id] = trimmed;
      }
      const saved = writeCopyOverrides(cleaned);
      sendJson(res, 200, { ok: true, ...saved, count: Object.keys(saved.overrides).length });
      return true;
    }
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  if (path === '/api/admin/copy/export' || path === '/api/admin/copy/export/') {
    const file = readCopyOverrides();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="copy-overrides.json"',
    });
    res.end(JSON.stringify(file, null, 2));
    return true;
  }

  return false;
}
