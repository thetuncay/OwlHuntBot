# ECONOMY AUDIT - OwlHuntBot

## 1. Source/Sink Balance
- **Inflation Source:** `hunt` generates currency (via sell) and materials. `pvp` generates flat 100 coins.
- **Sink Efficiency:**
    - `upgrade` costs scale exponentially, which is good.
    - `biome entry cost` is a new flat sink.
    - `market tax` removes 10% from every player trade.
- **Risk:** High-tier biomes might generate too much value compared to their entry cost.
- **Analysis:** Current `Deep Forest` entry cost (100) vs potential rare drops needs monitoring. If a Rare kirpi sells for 120, a single catch covers the cost.

## 2. Alt-Account Farming
- **Vectors:** Funneling items ucuza to main, or coins ucuza via fake items.
- **Defense:** Level 15 gate for marketplace and vergi (%10).
- **Risk:** Players can still wash money through the marketplace using multiple accounts if the tax is the only deterrent.

## 3. Dominant Strategies
- **Risk:** If one biome's loot-to-cost ratio is significantly better, players will never visit others.
- **Status:** Currently, `Town` is the only free option, making it the fallback. `Deep Forest` vs `Lake Side` choice depends on whether the player wants materials or consistency.

## 4. Item Profitability (Dismantle vs Sell)
- **Status:** Dismantling a common item (fare) for materials vs selling for 5 coins.
- **Risk:** If material prices in the market drop below sell price, dismantling becomes a net loss. System should allow for flexible pricing.
