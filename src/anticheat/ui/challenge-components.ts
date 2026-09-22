import { CHALLENGE_TIMEOUT_SEC } from '../config';
import type { ChallengeStartResult } from '../challenge-manager';
import { formatCaptchaStrikeBar } from '../challenge-manager';

export function buildChallengePromptMessage(codeLength: number): string {
  const unit = codeLength === 1 ? 'karakter' : 'karakterli kelimeyi';
  return (
    `⚠️ | Beep Boop. Gerçek insan mısın? Lütfen aşağıdaki **${codeLength} ${unit}** yazarak yanıtla!\n` +
    `_(Büyük/küçük harf duyarlı · ${Math.floor(CHALLENGE_TIMEOUT_SEC / 60)} dk süre)_`
  );
}

export function buildChallengeGateMessage(displayName: string): string {
  return `⛔ | **${displayName}**, bot koruması devrede. Captcha'yı çözmeden komut kullanamazsın.`;
}

export function buildChallengeSuccessMessage(strikes: number): string {
  const strikeBar = formatCaptchaStrikeBar(strikes);
  const timeoutMin = Math.floor(CHALLENGE_TIMEOUT_SEC / 60);
  return (
    `👍 | İnsan olduğunu doğruladım! Teşekkürler! :3\n` +
    `⚠️ | Captcha'ları **${timeoutMin} dakika** içinde çöz! Aksi halde ceza uygulanır!\n` +
    `${timeoutMin} dakika içinde çözülemeyen captcha: ${strikeBar}`
  );
}

export function buildChallengeWrongMessage(codeLength: number): string {
  return (
    `❌ | Yanlış kod. Görseldeki **${codeLength} karakteri** birebir yaz ` +
    `(büyük/küçük harf dahil).`
  );
}

export function buildChallengeExpiredMessage(strikes: number): string {
  const strikeBar = formatCaptchaStrikeBar(strikes);
  return (
    `⌛ | Captcha süresi doldu. Bir komut daha dene — yeni captcha gönderilecek.\n` +
    `10 dakika içinde çözülemeyen captcha: ${strikeBar}`
  );
}

export function buildChallengeCaptchaPayload(session: ChallengeStartResult) {
  return {
    content: buildChallengePromptMessage(session.codeLength),
    files: [
      {
        attachment: session.imageBuffer,
        name: session.imageName,
      },
    ],
  };
}
