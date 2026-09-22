/**
 * Discord application emoji runtime hydrate.
 * Statik ID dosyası yanlış/eski olsa bile canlı API ID kullanılır;
 * uygulamada yoksa unicode fallback (Discord’da `:isim:` kırıntısı olmaz).
 */

export interface LiveEmojiEntry {
  id: string;
  animated: boolean;
}

const liveByName = new Map<string, LiveEmojiEntry>();
let hydrated = false;

/** Portal’da yazım hatası / kırpılmış isim → registry adı */
const APPLICATION_EMOJI_NAME_ALIASES: Record<string, string> = {
  ay: 'ayi',
  bukelamun: 'bukelemun',
  kabkumbaga: 'kaplumbaga',
};

/**
 * Application emoji hydrate edildi mi?
 */
export function isApplicationEmojiHydrated(): boolean {
  return hydrated;
}

/**
 * Application emoji haritası (hydrate sonrası).
 *
 * @param name Discord emoji name
 */
export function getLiveApplicationEmoji(name: string): LiveEmojiEntry | undefined {
  const direct = liveByName.get(name);
  if (direct) return direct;
  for (const [portalName, canonical] of Object.entries(APPLICATION_EMOJI_NAME_ALIASES)) {
    if (canonical === name) {
      const aliased = liveByName.get(portalName);
      if (aliased) return aliased;
    }
  }
  return undefined;
}

/**
 * Bot uygulamasındaki emojileri API’den çeker ve belleğe yazar.
 *
 * @param token Bot token
 * @param applicationId CLIENT_ID
 */
export async function hydrateApplicationEmojis(
  token: string,
  applicationId: string,
): Promise<{ loaded: number; names: string[] }> {
  const res = await fetch(
    `https://discord.com/api/v10/applications/${applicationId}/emojis`,
    { headers: { Authorization: `Bot ${token}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`application emojis HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { items?: Array<{ id: string; name: string; animated?: boolean }> }
    | Array<{ id: string; name: string; animated?: boolean }>;
  const items = Array.isArray(data) ? data : (data.items ?? []);

  liveByName.clear();
  for (const e of items) {
    const entry = { id: e.id, animated: !!e.animated };
    liveByName.set(e.name, entry);
    const canonical = APPLICATION_EMOJI_NAME_ALIASES[e.name];
    if (canonical && !liveByName.has(canonical)) {
      liveByName.set(canonical, entry);
    }
  }
  hydrated = true;

  return { loaded: liveByName.size, names: [...liveByName.keys()] };
}

/** Test helper — hydrate bayrağını sıfırla. */
export function resetApplicationEmojiHydrateForTests(): void {
  liveByName.clear();
  hydrated = false;
}

/** Test helper — sahte live map. */
export function setApplicationEmojisForTests(
  entries: Array<{ name: string; id: string; animated?: boolean }>,
): void {
  liveByName.clear();
  for (const e of entries) {
    liveByName.set(e.name, { id: e.id, animated: !!e.animated });
  }
  hydrated = true;
}
