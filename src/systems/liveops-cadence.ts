export interface LiveOpsModifier {
  huntBonusRate: number;
  label: string;
}

export function currentLiveOpsModifier(now = new Date()): LiveOpsModifier {
  const dow = now.getUTCDay(); // 0 sun ... 6 sat
  // Haftalık mini event: Cuma-Cumartesi-Pazar
  if (dow === 5 || dow === 6 || dow === 0) {
    return {
      huntBonusRate: 0.12,
      label: 'Hafta Sonu Av Etkinliği',
    };
  }
  return {
    huntBonusRate: 0,
    label: '',
  };
}
