export interface OwlNameFields {
  species: string;
  nickname?: string | null;
}

/** Birincil başlık — özel takma ad, yoksa sahip Discord adı, o da yoksa species */
export function getOwlPrimaryName(
  owl: OwlNameFields,
  ownerDisplayName?: string | null,
): string {
  const nick = owl.nickname?.trim();
  if (nick) return nick;
  const owner = ownerDisplayName?.trim();
  if (owner) return owner;
  return owl.species;
}

/** İkincil satır — takma ad veya Discord adı varken species; yoksa null */
export function getOwlSpeciesSubtitle(
  owl: OwlNameFields,
  ownerDisplayName?: string | null,
): string | null {
  const nick = owl.nickname?.trim();
  if (nick) return owl.species;
  if (ownerDisplayName?.trim()) return owl.species;
  return null;
}

export function formatOwlIdentity(
  owl: OwlNameFields,
  ownerDisplayName?: string | null,
): { primary: string; subtitle: string | null } {
  return {
    primary: getOwlPrimaryName(owl, ownerDisplayName),
    subtitle: getOwlSpeciesSubtitle(owl, ownerDisplayName),
  };
}

/** VS / savaş ekranı için satırlar (🦉 + opsiyonel species alt satırı) */
export function formatOwlVsLines(
  owl: OwlNameFields,
  ownerDisplayName?: string | null,
): string[] {
  const { primary, subtitle } = formatOwlIdentity(owl, ownerDisplayName);
  const lines = [`🦉 **${primary}**`];
  if (subtitle) lines.push(`> *${subtitle}*`);
  return lines;
}

/** Liste/embed için iki satırlık metin (markdown) */
export function formatOwlIdentityBlock(
  owl: OwlNameFields,
  boldPrimary = true,
  ownerDisplayName?: string | null,
): string {
  const { primary, subtitle } = formatOwlIdentity(owl, ownerDisplayName);
  if (subtitle) {
    return boldPrimary
      ? `**${primary}**\n> *${subtitle}*`
      : `${primary}\n> *${subtitle}*`;
  }
  return boldPrimary ? `**${primary}**` : primary;
}
