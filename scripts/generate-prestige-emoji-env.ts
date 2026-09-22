#!/usr/bin/env npx tsx
/** Owl evolution emoji .env satırları — npx tsx scripts/generate-prestige-emoji-env.ts */
import { owlEvolutionEmojiDefs } from '../src/config/custom-emojis';
import { OWL_EVOLUTION_EMOJI_BY_NAME } from '../src/config/owl-evolution-emoji-ids';

console.log('# --- OwlHunt Evolution Emojis ---');
for (const def of owlEvolutionEmojiDefs()) {
  const entry = OWL_EVOLUTION_EMOJI_BY_NAME[def.name];
  if (entry) console.log(`${def.envVar}=${entry.id}`);
}
