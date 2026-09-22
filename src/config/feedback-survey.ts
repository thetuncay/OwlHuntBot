/**
 * Feedback anket kampanyası — soru tanımları.
 */
export const FEEDBACK_CAMPAIGN_SLUG = 'community-feedback-2026-q2';

export const FEEDBACK_REWARD_COINS = 5000;
export const FEEDBACK_REWARD_LOOTBOX_NAME = 'Eşya Kutusu';
export const FEEDBACK_REWARD_LOOTBOX_QTY = 5;

export type FeedbackQuestionType =
  | 'single_choice'
  | 'long_text'
  | 'short_text'
  | 'likert_with_text'
  | 'nps_slider'
  | 'text_with_images'
  | 'choice_with_text';

export interface FeedbackQuestionOption {
  value: string;
  label: string;
}

export interface FeedbackQuestionDef {
  id: string;
  section: 'segmentation' | 'experience' | 'depth';
  sectionTitle: string;
  label: string;
  hint?: string;
  type: FeedbackQuestionType;
  required: boolean;
  options?: FeedbackQuestionOption[];
  minLength?: number;
  maxLength?: number;
  /** choice_with_text / still_play: value that requires text */
  textRequiredWhen?: string[];
}

export const FEEDBACK_SECTIONS = [
  { id: 'segmentation', title: 'Segmentasyon' },
  { id: 'experience', title: 'Deneyim' },
  { id: 'depth', title: 'Derinlik' },
] as const;

export const FEEDBACK_QUESTIONS: FeedbackQuestionDef[] = [
  {
    id: 'play_duration',
    section: 'segmentation',
    sectionTitle: 'Segmentasyon',
    label: 'Ne zamandır oynuyorsun?',
    type: 'single_choice',
    required: true,
    options: [
      { value: '1w', label: '1 haftadan az' },
      { value: '2w', label: '1–2 hafta' },
      { value: '1m', label: 'Yaklaşık 1 ay' },
      { value: '2m', label: '2 ay (lansmandan beri)' },
      { value: 'beta', label: 'Beta / erken erişimden beri' },
    ],
  },
  {
    id: 'nps',
    section: 'segmentation',
    sectionTitle: 'Segmentasyon',
    label: "OwlHunt'ı bir arkadaşına önerme ihtimalin?",
    hint: '0 = asla, 10 = kesinlikle',
    type: 'nps_slider',
    required: true,
  },
  {
    id: 'discovery',
    section: 'segmentation',
    sectionTitle: 'Segmentasyon',
    label: "OwlHunt'ı nereden duydun?",
    type: 'choice_with_text',
    required: true,
    options: [
      { value: 'friend', label: 'Arkadaş' },
      { value: 'discord_server', label: 'Discord sunucusu' },
      { value: 'ad', label: 'Reklam' },
      { value: 'other', label: 'Diğer' },
    ],
    textRequiredWhen: ['other'],
    maxLength: 200,
  },
  {
    id: 'play_frequency_7d',
    section: 'segmentation',
    sectionTitle: 'Segmentasyon',
    label: 'Son 7 günde kaç gün oynadın?',
    type: 'single_choice',
    required: true,
    options: [
      { value: '0', label: '0' },
      { value: '1-2', label: '1–2' },
      { value: '3-5', label: '3–5' },
      { value: 'daily', label: 'Her gün' },
    ],
  },
  {
    id: 'device',
    section: 'segmentation',
    sectionTitle: 'Segmentasyon',
    label: 'Çoğunlukla nereden oynuyorsun?',
    type: 'single_choice',
    required: true,
    options: [
      { value: 'mobile', label: 'Mobil Discord' },
      { value: 'desktop', label: 'Masaüstü Discord' },
      { value: 'both', label: 'Her ikisi' },
    ],
  },
  {
    id: 'most_fun',
    section: 'experience',
    sectionTitle: 'Deneyim',
    label: "En eğlenceli kısım sence ne?",
    type: 'long_text',
    required: true,
    minLength: 20,
    maxLength: 1500,
  },
  {
    id: 'most_boring',
    section: 'experience',
    sectionTitle: 'Deneyim',
    label: 'En sıkıcı bulduğun kısım ne?',
    type: 'long_text',
    required: true,
    minLength: 20,
    maxLength: 1500,
  },
  {
    id: 'most_useless',
    section: 'experience',
    sectionTitle: 'Deneyim',
    label: 'En gereksiz bulduğun kısım ne?',
    type: 'long_text',
    required: true,
    minLength: 20,
    maxLength: 1500,
  },
  {
    id: 'would_change',
    section: 'experience',
    sectionTitle: 'Deneyim',
    label: 'Bir şeyi değiştirmek istesen ne değiştirirsin?',
    type: 'long_text',
    required: true,
    minLength: 20,
    maxLength: 1500,
  },
  {
    id: 'why_when',
    section: 'experience',
    sectionTitle: 'Deneyim',
    label: 'Botu neden ve ne zaman oynuyorsun?',
    hint: 'Motivasyonun ve genelde hangi saatlerde oynadığını yaz.',
    type: 'long_text',
    required: true,
    minLength: 20,
    maxLength: 1500,
  },
  {
    id: 'text_typos_nonsense',
    section: 'experience',
    sectionTitle: 'Deneyim',
    label: 'Gördüğün yazım bozukluğu veya saçmaladığını düşündüğün bir kısım var mı?',
    hint: 'Metin veya ekran görüntüsü yeterli — ikisi de opsiyonel ama en az biri olmalı (boş bırakabilirsin).',
    type: 'text_with_images',
    required: false,
    maxLength: 1500,
  },
  {
    id: 'help_sufficient',
    section: 'depth',
    sectionTitle: 'Derinlik',
    label: 'owl help yeterli mi?',
    type: 'likert_with_text',
    required: true,
    maxLength: 500,
  },
  {
    id: 'economy_fair',
    section: 'depth',
    sectionTitle: 'Derinlik',
    label: 'Coin kazanmak / harcamak adil mi?',
    type: 'likert_with_text',
    required: true,
    maxLength: 500,
  },
  {
    id: 'favorite_mode',
    section: 'depth',
    sectionTitle: 'Derinlik',
    label: 'En çok hangi modu oynuyorsun?',
    type: 'single_choice',
    required: true,
    options: [
      { value: 'hunt', label: 'Hunt' },
      { value: 'pvp', label: 'PvP' },
      { value: 'market', label: 'Market' },
      { value: 'upgrade', label: 'Upgrade' },
      { value: 'gamble', label: 'Kumar' },
      { value: 'quests', label: 'Görevler' },
      { value: 'equal', label: 'Hepsi eşit' },
    ],
  },
  {
    id: 'missing_feature',
    section: 'depth',
    sectionTitle: 'Derinlik',
    label: 'Olmazsa olmaz dediğin bir özellik var mı?',
    type: 'short_text',
    required: false,
    maxLength: 500,
  },
  {
    id: 'still_play_3mo',
    section: 'depth',
    sectionTitle: 'Derinlik',
    label: '3 ay sonra hâlâ oynar mısın?',
    type: 'choice_with_text',
    required: true,
    options: [
      { value: 'yes', label: 'Evet' },
      { value: 'maybe', label: 'Belki' },
      { value: 'no', label: 'Hayır' },
    ],
    textRequiredWhen: ['maybe', 'no'],
    maxLength: 500,
  },
];

export function feedbackQuestionsJson(): unknown {
  return FEEDBACK_QUESTIONS;
}
