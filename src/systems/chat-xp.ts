import { AttachmentBuilder, type Message } from 'discord.js';
import sharp, { type OverlayOptions } from 'sharp';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import {
  CHAT_XP_COOLDOWN_MS,
  CHAT_XP_MAX,
  CHAT_XP_MIN,
  CHAT_XP_MIN_MESSAGE_LENGTH,
} from '../config';
import { addXP } from './xp';
import { guardCooldown } from '../middleware/cooldown-manager';
import { xpRequired } from '../utils/math';
import { COIN_EMOJI, XP_EMOJI } from '../config/ui-emojis';

const CHAT_XP_SOURCE = 'chatMessage';

function chatXpCooldownKey(userId: string): string {
  return `cooldown:chatxp:${userId}`;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function asBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function createCircularAvatar(avatarUrl: string, size: number): Promise<Buffer | null> {
  try {
    const res = await fetch(avatarUrl);
    if (!res.ok) return null;
    const avatarRaw = Buffer.from(await res.arrayBuffer());
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${
        size / 2
      }" fill="white"/></svg>`,
    );
    return await sharp(avatarRaw)
      .resize(size, size, { fit: 'cover' })
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

async function buildLevelUpCard(params: {
  displayName: string;
  avatarUrl: string;
  oldLevel: number;
  newLevel: number;
  gainedXp: number;
  coinReward: number;
}): Promise<Buffer> {
  const width = 760;
  const height = 250;
  const avatarSize = 128;
  const avatar = await createCircularAvatar(params.avatarUrl, avatarSize);

  const progressPercent = Math.max(0, Math.min(100, Math.round((params.newLevel / 120) * 100)));
  const cardSvg = Buffer.from(
    `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1b1038"/>
          <stop offset="55%" stop-color="#3b1f63"/>
          <stop offset="100%" stop-color="#1f274f"/>
        </linearGradient>
        <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#6ee7ff"/>
          <stop offset="100%" stop-color="#a78bfa"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="url(#bg)"/>
      <rect x="30" y="30" width="${avatarSize}" height="${avatarSize}" rx="${avatarSize / 2}" fill="#111827"/>

      <text x="180" y="66" fill="#fde68a" font-size="34" font-family="Inter, Arial, sans-serif" font-weight="700">
        ★ LEVEL UP ★
      </text>
      <text x="180" y="108" fill="#e9d5ff" font-size="26" font-family="Inter, Arial, sans-serif">
        ${escapeXml(params.displayName)}
      </text>
      <text x="180" y="170" fill="#ffffff" font-size="88" font-family="Inter, Arial, sans-serif" font-weight="800">
        ${params.newLevel}
      </text>
      <text x="330" y="170" fill="#c4b5fd" font-size="34" font-family="Inter, Arial, sans-serif">
        Lv ${params.oldLevel} -> ${params.newLevel}
      </text>
      <text x="500" y="92" fill="#dbeafe" font-size="30" font-family="Inter, Arial, sans-serif" font-weight="700">
        +${params.gainedXp.toLocaleString('tr-TR')} XP
      </text>
      <text x="500" y="132" fill="#fde68a" font-size="30" font-family="Inter, Arial, sans-serif" font-weight="700">
        +${params.coinReward.toLocaleString('tr-TR')} Coin
      </text>

      <rect x="30" y="208" width="${width - 60}" height="16" rx="8" fill="#0f172a" opacity="0.75"/>
      <rect x="30" y="208" width="${Math.round(((width - 60) * progressPercent) / 100)}" height="16" rx="8" fill="url(#bar)"/>
    </svg>
  `,
  );

  const composites: OverlayOptions[] = [{ input: cardSvg }];
  if (avatar) {
    composites.push({ input: avatar, top: 30, left: 30 });
  }

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 12, g: 16, b: 28, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

export async function maybeAwardChatXp(
  message: Message,
  deps: { prisma: PrismaClient; redis: Redis },
): Promise<void> {
  if (!message.guildId || message.author.bot) return;
  if (!asBool(process.env.CHAT_XP_ENABLED, true)) return;

  const content = message.content.trim();
  if (content.length < CHAT_XP_MIN_MESSAGE_LENGTH) return;

  const cooldown = await guardCooldown(deps.redis, chatXpCooldownKey(message.author.id), CHAT_XP_COOLDOWN_MS);
  if (cooldown.active) return;

  const player = await deps.prisma.player.findUnique({
    where: { id: message.author.id },
    select: { id: true, level: true, xp: true, prestigeLevel: true },
  }) ?? await deps.prisma.player.create({
    data: { id: message.author.id },
    select: { id: true, level: true, xp: true, prestigeLevel: true },
  }).catch(async () =>
    deps.prisma.player.findUnique({
      where: { id: message.author.id },
      select: { id: true, level: true, xp: true, prestigeLevel: true },
    }),
  );
  if (!player) return;

  const baseXp = randomInt(CHAT_XP_MIN, CHAT_XP_MAX);
  const xpResult = await addXP(
    deps.prisma,
    message.author.id,
    baseXp,
    CHAT_XP_SOURCE,
    player,
    undefined,
    deps.redis,
  );
  if (!xpResult.levelUp) return;

  const card = await buildLevelUpCard({
    displayName: message.member?.displayName ?? message.author.displayName ?? message.author.username,
    avatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 256 }),
    oldLevel: xpResult.levelUp.oldLevel,
    newLevel: xpResult.levelUp.newLevel,
    gainedXp: xpResult.gainedXP,
    coinReward: xpResult.levelUp.reward?.coins ?? 0,
  });

  const required = xpRequired(xpResult.levelUp.newLevel);
  await message.reply({
    content:
      `✨ <@${message.author.id}> **seviye atladı!** ` +
      `(Lv ${xpResult.levelUp.oldLevel} → ${xpResult.levelUp.newLevel})\n` +
      `${XP_EMOJI} ${xpResult.levelUp.remainingXP.toLocaleString('tr-TR')} / ${required.toLocaleString('tr-TR')}  ·  ${COIN_EMOJI} +${(xpResult.levelUp.reward?.coins ?? 0).toLocaleString('tr-TR')}`,
    files: [new AttachmentBuilder(card, { name: 'level-up.png' })],
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
}
