/**
 * Discord Linked Roles metadata şemasını kaydeder (tek seferlik).
 * Kullanım: pnpm tsx scripts/register-linked-roles-metadata.ts
 */
import 'dotenv/config';

async function main(): Promise<void> {
  const clientId = process.env.CLIENT_ID?.trim();
  const token = process.env.DISCORD_TOKEN?.trim();
  if (!clientId || !token) {
    console.error('CLIENT_ID ve DISCORD_TOKEN gerekli');
    process.exit(1);
  }

  const url = `https://discord.com/api/v10/applications/${clientId}/role-connections/metadata`;
  const body = [
    {
      key: 'level',
      name: 'Seviye',
      description: 'Oyuncu seviyesi en az',
      type: 2, // INTEGER_GREATER_THAN
    },
    {
      key: 'hunts',
      name: 'Toplam Av',
      description: 'Toplam av sayısı en az',
      type: 2,
    },
    {
      key: 'power',
      name: 'Güç Skoru',
      description: 'Güç skoru en az',
      type: 2,
    },
    {
      key: 'registered',
      name: 'Kayıtlı Oyuncu',
      description: 'OwlHunt\'a kayıtlı mı',
      type: 7, // BOOLEAN_EQUAL
    },
  ];

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Kayıt başarısız (${res.status}):`, text);
    process.exit(1);
  }

  console.log('Linked Roles metadata kaydedildi:');
  console.log(text);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
