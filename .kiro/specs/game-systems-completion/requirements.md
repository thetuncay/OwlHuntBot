# Requirements Document

## Introduction

BaykusBot is a Turkish Discord RPG bot built around owl taming, hunting, and progression systems. Three existing game systems have incomplete implementations that leave players with missing information or broken quest tracking:

1. **Prestige deep stats display** — The `owl stats deep` command shows the prestige stat cap bonus but omits the XP bonus that prestige levels grant. Players cannot see the full effect of their prestige investment.
2. **Tame quest tracking** — The daily quest system defines a `tame` quest type, but the tame success path does not reliably call `trackQuestProgress`, so tame completions are not counted toward the daily quest.
3. **Quest progress bar** — The `owl quests` command shows plain text like `⏳ 3/10` for in-progress quests. A visual progress bar using the existing `hpBar` utility would make quest status easier to read at a glance.

This feature completes all three gaps with minimal surface-area changes, reusing existing utilities and patterns already present in the codebase.

---

## Glossary

- **Stats_UX**: The `buildOwlStatsEmbed` function in `src/utils/stats-ux.ts` responsible for constructing the owl stats Discord embed.
- **PlayerStatsData**: The TypeScript interface in `stats-ux.ts` that carries player-level data into `Stats_UX`.
- **Deep_Mode**: The optional `deep = true` rendering path inside `Stats_UX` that shows the `🔬 Formül Kırılımı` field with per-stat softcap breakdowns.
- **Prestige_Level**: An integer stored on the `Player` record (`player.prestigeLevel`) representing how many times the player has prestiged. Each level grants +2 stat cap and +5% XP bonus.
- **Quest_Tracker**: The `trackQuestProgress` function in `src/systems/daily-quests.ts` that increments a player's daily quest `current` counter for a given quest type.
- **Tame_System**: The tame logic in `src/systems/tame.ts`, specifically `commitTameResult` (button-driven flow) and `attemptTame` (item-driven flow).
- **Quest_UI**: The `owl quests` command implemented in `src/commands/owl-quests.ts` that renders the daily quest embed.
- **hpBar**: The `hpBar(current, max, length?)` function exported from `src/utils/theme.ts` that returns a monospace `█░` progress bar string.
- **PRESTIGE_XP_BONUS_PER_LEVEL**: The config constant (value: `0.05`) representing the XP multiplier bonus added per prestige level.
- **PRESTIGE_STAT_CAP_BONUS_PER_LEVEL**: The config constant (value: `2`) representing the stat cap increase per prestige level.

---

## Requirements

### Requirement 1: Prestige XP Bonus in Deep Stats

**User Story:** As a player who has prestiged, I want the `owl stats deep` command to show my prestige XP bonus percentage, so that I can see the full benefit of my prestige level in one place.

#### Acceptance Criteria

1. WHEN `Deep_Mode` is active AND `Prestige_Level` is greater than 0, THE `Stats_UX` SHALL include a line displaying the XP bonus as `🌟 Prestige XP: +N%` where N equals `Prestige_Level` multiplied by 5.
2. WHEN `Deep_Mode` is active AND `Prestige_Level` is 0, THE `Stats_UX` SHALL display `🌟 Prestige XP: +0%` in the `🔬 Formül Kırılımı` field.
3. THE `Stats_UX` SHALL display the prestige XP bonus line immediately after the existing `🌟 Prestige: +X stat cap` line in the `🔬 Formül Kırılımı` field.
4. WHEN `Deep_Mode` is inactive, THE `Stats_UX` SHALL NOT include the prestige XP bonus line in the embed output.
5. FOR ALL valid integer values of `Prestige_Level` between 0 and 20 inclusive, THE `Stats_UX` SHALL display an XP bonus percentage equal to `Prestige_Level * PRESTIGE_XP_BONUS_PER_LEVEL * 100`, rounded to the nearest integer.

---

### Requirement 2: Tame Quest Tracking on Success

**User Story:** As a player completing the daily tame quest, I want my tame successes to be counted automatically, so that I can claim the tame quest reward after successfully taming an owl.

#### Acceptance Criteria

1. WHEN `Tame_System` records a successful tame via `commitTameResult`, THE `Quest_Tracker` SHALL be called with quest type `'tame'` and amount `1` for the player who performed the tame.
2. WHEN `Tame_System` records a successful tame via `attemptTame`, THE `Quest_Tracker` SHALL be called with quest type `'tame'` and amount `1` for the player who performed the tame.
3. IF a tame attempt fails for any reason (escape, injury, PvP loss, or plain failure), THEN THE `Quest_Tracker` SHALL NOT be called for quest type `'tame'`.
4. WHEN `Quest_Tracker` is called after a tame success, THE `Quest_Tracker` SHALL increment the player's active `tame` daily quest `current` field by exactly 1, provided the quest has not yet been claimed and has not yet reached its target.
5. IF the player has no active `tame` daily quest at the time of a successful tame, THEN THE `Quest_Tracker` SHALL complete without error and without modifying any quest records.
6. THE `Tame_System` SHALL NOT block the tame success response on `Quest_Tracker` completion — quest tracking errors SHALL be silently suppressed and SHALL NOT cause the tame result to fail.

---

### Requirement 3: Quest Visual Progress Bar

**User Story:** As a player checking my daily quests, I want to see a visual progress bar for each in-progress quest, so that I can quickly gauge how close I am to completing each quest without reading numbers.

#### Acceptance Criteria

1. WHEN `Quest_UI` renders a quest whose `current` is less than `target` and `isClaimed` is false, THE `Quest_UI` SHALL display a visual progress bar produced by `hpBar(current, target, 10)` alongside the numeric count.
2. THE `Quest_UI` SHALL display the progress bar and numeric count in the format `` `[bar]` current/target `` where `[bar]` is the 10-segment `hpBar` output, replacing the existing `⏳ current/target` text for in-progress quests.
3. WHEN a quest's `current` equals 0, THE `Quest_UI` SHALL display a fully empty bar (`░░░░░░░░░░`) with the count `0/target`.
4. WHEN a quest's `current` equals `target`, THE `Quest_UI` SHALL display the `🌟 Tamamlandı` status text rather than a progress bar, consistent with the existing completed-quest display.
5. WHEN a quest's `isClaimed` is true, THE `Quest_UI` SHALL display the `✅ Alındı` status text rather than a progress bar, consistent with the existing claimed-quest display.
6. FOR ALL integer pairs `(current, target)` where `0 ≤ current < target` and `target > 0`, THE `hpBar` function SHALL return a string of exactly 10 characters composed only of `█` and `░` characters.
7. FOR ALL integer pairs `(current, target)` where `0 ≤ current ≤ target` and `target > 0`, the number of `█` characters returned by `hpBar(current, target, 10)` SHALL equal `Math.round((current / target) * 10)`.
8. THE `Quest_UI` SHALL apply the same progress bar format in both the prefix message handler (`runQuestsMessage`) and the slash command handler (`runQuestsSlash`).
