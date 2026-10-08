/** Sahte Discord mesaj/edit kaydı — gerçek API yok. */

export type RecordedAction = {
  tMs: number;
  kind: 'reply' | 'edit' | 'followUp';
  content?: string;
  hasFiles: boolean;
};

export class FakeSentMessage {
  readonly actions: RecordedAction[];
  private readonly t0: number;

  constructor(actions: RecordedAction[], t0: number) {
    this.actions = actions;
    this.t0 = t0;
  }

  async edit(payload: unknown): Promise<this> {
    this.actions.push({
      tMs: performance.now() - this.t0,
      kind: 'edit',
      content: extractContent(payload),
      hasFiles: hasFiles(payload),
    });
    return this;
  }
}

export class FakeMessage {
  readonly actions: RecordedAction[] = [];
  readonly t0 = performance.now();
  readonly author: { id: string; username: string; displayName: string };
  readonly member: { displayName: string } | null;
  readonly guildId: string | null;

  constructor(userId: string, guildId = 'bench-guild') {
    this.author = { id: userId, username: `u_${userId.slice(0, 8)}`, displayName: 'Bench' };
    this.member = { displayName: 'Bench' };
    this.guildId = guildId;
  }

  async reply(payload: unknown): Promise<FakeSentMessage> {
    this.actions.push({
      tMs: performance.now() - this.t0,
      kind: 'reply',
      content: extractContent(payload),
      hasFiles: hasFiles(payload),
    });
    return new FakeSentMessage(this.actions, this.t0);
  }
}

function extractContent(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload.slice(0, 200);
  if (payload && typeof payload === 'object' && 'content' in payload) {
    const c = (payload as { content?: unknown }).content;
    return typeof c === 'string' ? c.slice(0, 200) : undefined;
  }
  return undefined;
}

function hasFiles(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as { files?: unknown };
  return Array.isArray(p.files) && p.files.length > 0;
}
