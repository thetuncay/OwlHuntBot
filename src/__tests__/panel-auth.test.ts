import { describe, expect, it, beforeEach } from 'vitest';
import { requiresOpsPanelAuth, enforceOpsPanelAuth } from '../ops/panel-auth';
import type { IncomingMessage, ServerResponse } from 'node:http';

function mockRes(): ServerResponse & { status?: number; body?: string; headers?: Record<string, string> } {
  const res = {
    status: undefined as number | undefined,
    body: undefined as string | undefined,
    headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      this.status = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(body?: string) {
      this.body = body;
    },
  };
  return res as ServerResponse & typeof res;
}

describe('panel-auth', () => {
  beforeEach(() => {
    delete process.env.OPS_PANEL_USERNAME;
    delete process.env.OPS_PANEL_PASSWORD;
    process.env.NODE_ENV = 'development';
  });

  it('marks admin paths', () => {
    expect(requiresOpsPanelAuth('/admin')).toBe(true);
    expect(requiresOpsPanelAuth('/admin/app.js')).toBe(true);
    expect(requiresOpsPanelAuth('/api/guilds')).toBe(true);
    expect(requiresOpsPanelAuth('/api/admin/anticheat/trust')).toBe(true);
    expect(requiresOpsPanelAuth('/')).toBe(false);
    expect(requiresOpsPanelAuth('/api/public/config')).toBe(false);
  });

  it('allows dev without credentials', () => {
    const req = { headers: {} } as IncomingMessage;
    const res = mockRes();
    expect(enforceOpsPanelAuth(req, res)).toBe(true);
  });

  it('rejects wrong password', () => {
    process.env.OPS_PANEL_USERNAME = 'admin';
    process.env.OPS_PANEL_PASSWORD = 'secret';
    const req = {
      headers: { authorization: `Basic ${Buffer.from('admin:wrong').toString('base64')}` },
    } as IncomingMessage;
    const res = mockRes();
    expect(enforceOpsPanelAuth(req, res)).toBe(false);
    expect(res.status).toBe(401);
  });

  it('accepts valid basic auth', () => {
    process.env.OPS_PANEL_USERNAME = 'admin';
    process.env.OPS_PANEL_PASSWORD = 'secret';
    const req = {
      headers: { authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}` },
    } as IncomingMessage;
    const res = mockRes();
    expect(enforceOpsPanelAuth(req, res)).toBe(true);
  });
});
