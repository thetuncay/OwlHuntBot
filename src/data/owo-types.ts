/** OwO analiz çıktısı tipleri — analyze-owo-data.ts tarafından üretilir */

export interface OwOInsights {
  generatedAt: string;
  sourceGuildId: string | null;
  economyRecommendations: {
    owoDailyMedianCowoncy: number;
    suggestedQuestTotalCoins: number;
    suggestedDAILY_QUEST_CONFIG: {
      hunt: number;
      craft: number;
      tame: number;
      market: number;
    };
    suggestedDUEL_DAILY_COIN_CAP: number;
    encounterFightMinCoins: number;
  };
  flowHints: {
    huntLoop: string;
    afterDaily: string;
    afterQuests: string;
    encounterLoop: string;
  };
  owoToOwlAliases: Record<string, string>;
  topBigrams: { key: string; count: number }[];
}
