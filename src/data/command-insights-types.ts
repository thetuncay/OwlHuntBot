/** Komut analiz çıktısı tipleri — analyze-command-data.ts tarafından üretilir */

export interface CommandInsights {
  generatedAt: string;
  sourceGuildId: string | null;
  economyRecommendations: {
    dailyMedianCoins: number;
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
  legacyToOwlAliases: Record<string, string>;
  topBigrams: { key: string; count: number }[];
}
