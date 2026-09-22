import {
  FEEDBACK_QUESTIONS,
  type FeedbackQuestionDef,
} from '../config/feedback-survey';

export type FeedbackAnswerValue =
  | string
  | number
  | { choice: string; text?: string }
  | { likert: number; text?: string }
  | { text?: string; attachmentIds?: string[] };

export type FeedbackAnswers = Record<string, FeedbackAnswerValue>;

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim();
}

function cleanText(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return stripHtml(raw).slice(0, maxLen);
}

function validChoice(q: FeedbackQuestionDef, choice: string): boolean {
  return Boolean(q.options?.some((o) => o.value === choice));
}

function validateQuestion(q: FeedbackQuestionDef, value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    if (q.required) return `${q.label}: cevap gerekli.`;
    return null;
  }

  switch (q.type) {
    case 'single_choice': {
      if (typeof value !== 'string' || !validChoice(q, value)) {
        return `${q.label}: geçersiz seçim.`;
      }
      return null;
    }
    case 'nps_slider': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 10) {
        return `${q.label}: 0–10 arası bir değer seç.`;
      }
      return null;
    }
    case 'long_text':
    case 'short_text': {
      const text = cleanText(value, q.maxLength ?? 1500);
      if (q.required && text.length < (q.minLength ?? 1)) {
        return `${q.label}: en az ${q.minLength ?? 1} karakter yaz.`;
      }
      if (!q.required && !text) return null;
      return null;
    }
    case 'likert_with_text': {
      if (typeof value !== 'object' || value === null || !('likert' in value)) {
        return `${q.label}: 1–5 arası puan ver.`;
      }
      const likert = Number((value as { likert: number }).likert);
      if (!Number.isInteger(likert) || likert < 1 || likert > 5) {
        return `${q.label}: 1–5 arası puan ver.`;
      }
      const text = cleanText((value as { text?: string }).text ?? '', q.maxLength ?? 500);
      void text;
      return null;
    }
    case 'choice_with_text': {
      if (typeof value !== 'object' || value === null || !('choice' in value)) {
        return `${q.label}: bir seçenek seç.`;
      }
      const choice = String((value as { choice: string }).choice);
      if (!validChoice(q, choice)) return `${q.label}: geçersiz seçim.`;
      const text = cleanText((value as { text?: string }).text ?? '', q.maxLength ?? 500);
      if (q.textRequiredWhen?.includes(choice) && !text) {
        return `${q.label}: seçimin için kısa bir açıklama yaz.`;
      }
      return null;
    }
    case 'text_with_images': {
      const obj = typeof value === 'object' && value !== null ? value as { text?: string; attachmentIds?: string[] } : {};
      const text = cleanText(obj.text ?? '', q.maxLength ?? 1500);
      const ids = Array.isArray(obj.attachmentIds) ? obj.attachmentIds.filter((id) => typeof id === 'string') : [];
      if (text || ids.length > 0) return null;
      return null;
    }
    default:
      return null;
  }
}

export function normalizeFeedbackAnswers(raw: unknown): FeedbackAnswers {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Geçersiz cevap formatı.');
  }
  const input = raw as Record<string, unknown>;
  const out: FeedbackAnswers = {};

  for (const q of FEEDBACK_QUESTIONS) {
    const value = input[q.id];
    const err = validateQuestion(q, value);
    if (err) throw new Error(err);

    if (value === undefined || value === null || value === '') continue;

    switch (q.type) {
      case 'single_choice':
        out[q.id] = String(value);
        break;
      case 'nps_slider':
        out[q.id] = Number(value);
        break;
      case 'long_text':
      case 'short_text':
        out[q.id] = cleanText(value, q.maxLength ?? 1500);
        break;
      case 'likert_with_text': {
        const v = value as { likert: number; text?: string };
        out[q.id] = {
          likert: Number(v.likert),
          text: cleanText(v.text ?? '', q.maxLength ?? 500) || undefined,
        };
        break;
      }
      case 'choice_with_text': {
        const v = value as { choice: string; text?: string };
        out[q.id] = {
          choice: String(v.choice),
          text: cleanText(v.text ?? '', q.maxLength ?? 500) || undefined,
        };
        break;
      }
      case 'text_with_images': {
        const v = typeof value === 'object' && value !== null
          ? value as { text?: string; attachmentIds?: string[] }
          : {};
        const text = cleanText(v.text ?? '', q.maxLength ?? 1500);
        const attachmentIds = Array.isArray(v.attachmentIds)
          ? [...new Set(v.attachmentIds.filter((id) => typeof id === 'string'))].slice(0, 3)
          : [];
        if (text || attachmentIds.length) {
          out[q.id] = { text: text || undefined, attachmentIds };
        }
        break;
      }
    }
  }

  return out;
}

export function collectAttachmentIds(answers: FeedbackAnswers): string[] {
  const ids: string[] = [];
  for (const v of Object.values(answers)) {
    if (typeof v === 'object' && v !== null && 'attachmentIds' in v) {
      const arr = (v as { attachmentIds?: string[] }).attachmentIds;
      if (Array.isArray(arr)) ids.push(...arr);
    }
  }
  return [...new Set(ids)];
}
