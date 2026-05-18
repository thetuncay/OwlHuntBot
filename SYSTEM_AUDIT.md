# SYSTEM AUDIT - OwlHuntBot

## 1. Prestige System (Incomplete/Fake)
- **Severity:** High
- **Root Cause:** Configuration constants `PRESTIGE_XP_BONUS_PER_LEVEL` and `PRESTIGE_STAT_CAP_BONUS_PER_LEVEL` are defined but not integrated into the core logic.
- **Exploitability:** N/A (Player is disadvantaged).
- **Recommended Fix:**
    - Update `addXP` in `src/systems/xp.ts` to multiply base XP by `(1 + prestigeLevel * bonus)`.
    - Update `statEffect` in `src/utils/math.ts` and all its call sites to account for `prestigeLevel`.
- **Production Risk:** Low.

## 2. Biome System (UI Disconnect)
- **Severity:** High
- **Root Cause:** `rollHunt` supports `biomeId`, but command handlers in `src/commands/owl-hunt.ts` were defaulting or not allowing selection. (Wait, I remember fixing this in my previous session, but I must verify if it's truly connected and functional for the player).
- **Exploitability:** N/A.
- **Recommended Fix:** Ensure selection buttons are present and correctly passed to `rollHunt`.
- **Production Risk:** Low.

## 3. Marketplace ID Mismatch
- **Severity:** High
- **Root Cause:** UI shows 8-char truncated UUIDs, but `buyListing` was expecting full UUIDs.
- **Exploitability:** Prevents all purchases.
- **Recommended Fix:** (I implemented a partial lookup, need to verify it covers all edge cases like collisions).
- **Production Risk:** Low.

## 4. Tame Quest Tracking Missing
- **Severity:** Medium
- **Root Cause:** Success in `src/systems/tame.ts` does not call `trackQuestProgress`.
- **Exploitability:** Quest completion blocker.
- **Recommended Fix:** Add the call after successful tame creation.
- **Production Risk:** Low.

## 5. Crafting Slash Command (UX Gap)
- **Severity:** Medium
- **Root Cause:** Slash command was a placeholder directing to prefix command.
- **Exploitability:** Poor UX.
- **Recommended Fix:** Implement interactive buttons for slash craft.
- **Production Risk:** Low.

## 6. Atlas M0 Transaction Consistency
- **Severity:** Medium
- **Root Cause:** New systems use `$transaction` while older ones avoid it due to 5s timeout limits on M0.
- **Exploitability:** Potential for timeouts under high load.
- **Recommended Fix:** Audit transaction length; use `withLock` for pre-transaction checks to keep transactions as short as possible.
- **Production Risk:** Medium.
