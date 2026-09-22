/** Discord application emoji ID'leri — slot, coinflip animasyonları. */
export interface GambleEmojiEntry {
  name: string;
  id: string;
  animated: boolean;
}

export const GAMBLE_EMOJI_BY_NAME: Record<string, GambleEmojiEntry> = {
  "coin": { name: "coin", id: "1535046870030614558", animated: false },
  "CoinSpin": { name: "CoinSpin", id: "1535046845238087862", animated: true },
  "diamond": { name: "diamond", id: "1535046862544044193", animated: false },
  "image": { name: "image", id: "1535046878347919452", animated: false },
  "SlotsRolling": { name: "SlotsRolling", id: "1535046854696243200", animated: true },
};
