import sharp from 'sharp';

/** OwO tarzı karışık harf/rakam — belirsiz karakterler hariç. */
const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const CHAR_COLORS = ['#1a1a1a', '#8B0000', '#4B0082', '#006400', '#CC5500', '#1E90FF'];

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function escapeXml(ch: string): string {
  return ch
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateCaptchaCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)]!;
  }
  return out;
}

/** Görsel captcha — SVG buffer (Discord attachment). */
export function renderCaptchaSvg(code: string): Buffer {
  const width = 220;
  const height = 90;
  const slot = width / (code.length + 1);

  let noiseLines = '';
  for (let i = 0; i < 9; i++) {
    const colors = ['#e53935', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00'];
    noiseLines += `<line x1="${rand(0, width)}" y1="${rand(0, height)}" x2="${rand(0, width)}" y2="${rand(0, height)}" stroke="${colors[i % colors.length]}" stroke-width="${rand(1, 2)}" opacity="0.75"/>`;
  }

  let ghosts = '';
  for (let i = 0; i < 4; i++) {
    const g = CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)]!;
    ghosts += `<text x="${rand(5, width - 25)}" y="${rand(25, height - 5)}" font-size="${rand(36, 58)}" fill="#cccccc" opacity="0.35" font-family="Arial,sans-serif">${g}</text>`;
  }

  let chars = '';
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;
    const x = slot * (i + 0.85);
    const y = height / 2 + rand(-6, 14);
    const rot = rand(-28, 28);
    const size = rand(26, 38);
    const color = CHAR_COLORS[i % CHAR_COLORS.length]!;
    const weight = ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? 'bold' : 'normal';
    chars += `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" font-family="Arial,sans-serif" transform="rotate(${rot} ${x} ${y})">${escapeXml(ch)}</text>`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff" rx="10" stroke="#e0e0e0" stroke-width="1"/>
  ${ghosts}
  ${noiseLines}
  ${chars}
</svg>`;

  return Buffer.from(svg, 'utf-8');
}

/** Discord inline önizleme için PNG (SVG desteklenmiyor). */
export async function renderCaptchaPng(code: string): Promise<Buffer> {
  const svg = renderCaptchaSvg(code);
  return sharp(svg).png().toBuffer();
}
