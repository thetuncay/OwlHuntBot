/**
 * market-ux.ts — Baykuş Pazarı paylaşılan tipler ve format yardımcıları
 */

import { formatCoinLabel } from '../config/ui-emojis';
import type { MarketCategory, MarketSort } from '../systems/market';
import { statEffect } from './math';
import { getEffectiveStats } from './owl-stats';

export const DISTRICT_META: Record<MarketCategory, { label: string; browseLabel: string }> = {
  owl:      { label: 'Tüy Sıra',     browseLabel: 'Tüy Sıra' },
  buff:     { label: 'İksir Köşesi', browseLabel: 'İksir Köşesi' },
  material: { label: 'Örs Pasajı',   browseLabel: 'Örs Pasajı' },
  item:     { label: 'Çanta Sokağı', browseLabel: 'Çanta Sokağı' },
};

export const CATEGORY_META = DISTRICT_META;

export interface MarketSaleView {
  itemName: string;
  marketCategory: string;
  quantity: number;
  salePrice: number;
  soldAt: Date;
}

export interface MarketAnalyticsView {
  lastSalePrice: number;
  averagePrice24h: number;
  averagePrice7d: number;
}

export function formatMarketCoins(n: number): string {
  return formatCoinLabel(n);
}

export function timeAgoTr(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

export function timeUntilTr(date: Date): string {
  const mins = Math.floor((date.getTime() - Date.now()) / 60000);
  if (mins < 1) return 'yakında';
  if (mins < 60) return `${mins} dk`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} saat`;
  return `${Math.floor(hours / 24)} gün`;
}

export interface OwlMarketSnapshot {
  species: string;
  nickname: string | null;
  tier: number;
  quality: string;
  hp: number;
  hpMax: number;
  staminaCur: number;
  statGaga: number;
  statGoz: number;
  statKulak: number;
  statKanat: number;
  statPence: number;
  bond: number;
  effectiveness: number;
  power: number;
  sight: number;
  speed: number;
}

type OwlStatSource = Pick<
  OwlMarketSnapshot,
  | 'species' | 'nickname' | 'tier' | 'quality' | 'hp' | 'hpMax' | 'staminaCur'
  | 'statGaga' | 'statGoz' | 'statKulak' | 'statKanat' | 'statPence'
  | 'bond' | 'effectiveness'
>;

export function owlToMarketSnapshot(owl: OwlStatSource): OwlMarketSnapshot {
  const eff = getEffectiveStats(owl);
  return {
    ...owl,
    nickname: owl.nickname ?? null,
    power: Math.round(statEffect(eff.gaga) + statEffect(eff.pence)),
    sight: Math.round(statEffect(eff.goz) + statEffect(eff.kulak)),
    speed: Math.round(statEffect(eff.kanat)),
  };
}

const SORT_LABEL: Record<MarketSort, string> = {
  price_asc:      'Ucuzdan pahalıya',
  price_desc:     'Pahalıdan ucuza',
  newest:         'En yeni',
  oldest:         'En eski',
  ending_soon:    'Süresi doluyor',
  most_expensive: 'En pahalı',
  cheapest:       'En uygun',
};

export { SORT_LABEL };
