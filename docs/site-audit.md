# OwlHunt — Full Website & Product Audit

**Date:** June 2026  
**Scope:** Landing, login, player dashboard, admin ops-panel, Discord-rendered surfaces (hunt, leaderboard, profile/stats, market, tame, PvP, moderation)  
**Rule:** Refinement only — preserve owl mascot, dark theme, red/gold palette. No redesign.

**Live URL:** https://owlhunt.thetuncay.com  
**Source:** `public/site/`, `public/ops-panel/`, `src/utils/*-ux.ts`, `src/utils/theme.ts`

---

## Executive summary

OwlHunt has a **strong visual identity** (dark + red + gold + expressive owl art in `public/ops-panel/owlhuntweb/`) but the experience feels like a **template Discord-bot landing page** because:

1. Copy leads with a pun, not the product moment (a hunt result).
2. The same mascot art is repeated decoratively instead of mapped to states.
3. The admin ops-panel and Discord embeds use **different color systems** than the website.
4. Trust signals (proof, terms, consistent tone) are thin.

The highest-leverage fix is not new branding — it is **consistency + product-first storytelling + functional mascot states** using assets you already own.

---

## Brand lock (do not change)

| Token | Value | Usage |
|-------|-------|--------|
| Background | `#080808` | Page base |
| Surface | `#121010`, `#1a1212` | Cards, panels |
| Red | `#9b1c1c`, `#dc2626` | Accents, danger, borders |
| Gold | `#f5c518`, `#c9a012` | Headlines, CTAs, highlights |
| Text | `#f2ece4` | Body |
| Muted | `#9a8f88` | Secondary copy |
| Display font | Nunito 800–900 | Headlines, buttons |
| Body font | Source Sans 3 | Paragraphs |

Mascot assets: `public/ops-panel/owlhuntweb/01_normal.png` … `12_loading.png` (served at `/assets/owlhuntweb/`).

---

## Functional mascot expression system

**Current:** Landing uses 6 of 12 expressions in a decorative “mood strip” with no semantic meaning. `08_protector`, `09_premium`, `12_loading` are unused on the web. Empty/loading states have no mascot.

**Recommendation:** Treat the 12 PNGs as a **state system**, not wallpaper.

| Asset | Expression | Use on |
|-------|------------|--------|
| `01_normal` | Neutral | Nav, favicon, default brand |
| `02_happy` | Success | CTA band, post-login, hunt win |
| `03_angry` | Intense | Errors, PvP loss, failed tame |
| `04_sleeping` | Idle | Empty states, “no guilds”, offline |
| `05_thinking` | Focus | Loading decisions, `soru` / help |
| `06_surprised` | Rare moment | Rare drop, confetti, “did you know” |
| `07_developer` | Builder | **Ops-panel header** (replace 🦉 emoji) |
| `08_protector` | Guard | Moderation, `/owlonly`, permissions |
| `09_premium` | Crown | Prestige, top rank, premium CTA |
| `10_rich` | Wealth | Coins, market, shop sections |
| `11_boss` | Boss | Encounter / boss feature (in use) |
| `12_loading` | Wait | Skeleton/loading (dashboard, ops) |

**Why this feels less generic:** Premium products assign mascots to *meaning*, not decoration. Stripe, Linear, and game UIs use illustration sparingly but purposefully.

**Mood strip:** Either remove or relabel each thumbnail with a one-word state (e.g. “Nadir”, “Boss”, “Koruma”) and link to the matching feature section.

---

# Phase 1 — Full website audit

Format per section: **Current State → Problem → Why it feels generic → Recommended Improvement**

---

## 1. Navigation (topbar)

**Current state**  
Sticky bar: owl + “OwlHunt”, links (Ana Sayfa, Özellikler, Komutlar, Profilim), “Giriş Yap” ghost, “Sunucuya Ekle” gold pill. Red bottom border, blur backdrop.

**Problem**  
Two competing primaries (gold nav CTA vs red hero CTA). “Profilim” hidden until login with no hint for guests. No leaderboard or support link in nav.

**Why it feels generic**  
Standard bot-landing pattern: logo left, anchor links, invite button right. No personality beyond colors.

**Recommended improvement**  
- Single primary action hierarchy: **red = main conversion**, gold = secondary or nav-only.  
- Add “Destek” when `supportUrl` is set (mirror hero).  
- Guest: show “Profil” as ghost linking to `/login?next=/dashboard`.  
- Keep sticky + red rule; tighten vertical padding on mobile.

---

## 2. Hero section

**Current state**  
Eyebrow: “Discord av botu · Türkçe”. H1: “Hu! Bu ne? **OwlHunt!**”. Lead lists features in one paragraph. Primary CTA “Sunucuya Ekle”, hidden support. Stat line from API. Right: floating `01_normal` + `02_happy` spark, 75vh min-height.

**Problem**  
- Pun headline does not say what the bot *does* in 3 seconds.  
- No screenshot or hunt-result mock — only mascot PNGs.  
- Lead is a feature dump, not a human hook.  
- Hero dominates viewport; product proof is below fold.

**Why it feels generic**  
“Cute mascot + pun + invite button” is the default Discord bot landing formula (Other bots, Dank Memer clones). Reads AI/template because nothing proves gameplay.

**Recommended improvement**  
- Headline: outcome-first (“Discord’da avlan, koleksiyon kur, sıralamaya gir”).  
- Subhead: one sharp sentence, not bullet list in prose.  
- Add **product visual**: stylized hunt output (pipe lines `🌙 |`, `🦉 |`) or annotated Discord screenshot in `shot-frame` — same red/gold frame, no new palette.  
- Reduce `min-height` to ~55–60vh on desktop so feature A peeks above fold.  
- Hero owl: keep `01_normal`; use `06_surprised` only beside “nadir drop” callout, not duplicate happy owl.

---

## 3. Mood strip

**Current state**  
Six owl thumbnails in a row, hover scale, divider below hero.

**Problem**  
Decorative gallery with no labels or actions. Users scroll past it; it adds height without information.

**Why it feels generic**  
“Emoji/mascot strip” is filler common on generated landings to fill space.

**Recommended improvement**  
- **Option A:** Remove; redistribute vertical space to product proof.  
- **Option B:** Convert to **“Maskot halleri”** — 6 cards with labels (Normal, Mutlu, Boss, Premium, Yükleniyor, Koruma) tied to game states; each links to `#ozellikler` anchor.  
- Use full 12-asset system elsewhere (empty/loading), not here.

---

## 4. Feature section A — Hunting & rarity

**Current state**  
`shot-gold` frame, `06_surprised`, caption “owl hunt · Kritik av · nadir drop · confetti!”. H2 “Yüzlerce av, farklı nadirlikler”. Body mentions biomes and `owl hunt`.

**Problem**  
Caption mixes English game terms (“confetti”) with Turkish. Image is mascot, not hunt UI. “Yüzlerce” is unverified marketing scale.

**Why it feels generic**  
Feature row template: image left, H2 + paragraph right, gold heading.

**Recommended improvement**  
- Replace or overlay mascot with **real hunt message layout** (monospace command pill + sample loot line).  
- H2: specific (“Biyom seç, av at, nadirleri yakala”).  
- Caption: Turkish-only, match in-game pipe format.  
- Mascot `06_surprised` stays as emotional accent, smaller.

---

## 5. Feature section B — Boss & wealth

**Current state**  
RTL layout flip, `11_boss`, `/lb` pill, “Boss avları & zenginlik”, encounter/PvP/coins/leaderboard copy.

**Problem**  
`/lb` on boss card confuses two systems. “Zenginlik” and boss are merged without hierarchy.

**Why it feels generic**  
Alternating zig-zag feature blocks are a SaaS landing cliché.

**Recommended improvement**  
- Split visual metaphor: `11_boss` for encounter; `10_rich` inset for economy.  
- Two short bullets max; link “Sıralama → `/lb`” in copy, not on boss image.  
- Reduce card rotation (`rotate(1deg)`) — reads playful/cheap at scale.

---

## 6. Feature section C — Taming & biomes

**Current state**  
Duo small frames (`10_rich`, `05_thinking`), emoji bullets (🗺️ 🎣 ⚔️), `/owlonly` mention.

**Problem**  
Emoji bullets feel like Notion AI outline. Two small mascots duplicate section A/B pattern.

**Why it feels generic**  
Three-feature trio is the classic “Features” section every startup generator produces.

**Recommended improvement**  
- Replace emoji list with **command chips** (`/owlonly`, tame flow).  
- One mascot: `05_thinking` for strategy/tame.  
- Add single line: “30 dk biyom oturumu — seçimini yap, sonra avlan.”

---

## 7. Commands grid (“Hızlı başlangıç”)

**Current state**  
`07_developer` owl, 6 cards: `/owl hunt`, `/owl zoo`, `/lb`, `w hunt`, `/owl shop`, `/owl profile`.

**Problem**  
`/owl shop` and `/owl profile` **do not exist** in bot (actual: market, stats). Misleading for new users.

**Why it feels generic**  
Command grid is good for bots — but wrong commands destroy trust instantly.

**Recommended improvement**  
- Fix to real commands: `/owl market`, `/owl stats`, keep `/lb`, `w hunt`, `/owl zoo`.  
- Add one-line outcome per card (“Avlan”, “Koleksiyon”, “Sıralama”).  
- Optional: copy-to-clipboard on click.  
- Developer owl fits; keep.

---

## 8. CTA band

**Current state**  
`02_happy`, “Hazır mısın?”, one line, red “Sunucuya Ekle”.

**Problem**  
Weak secondary path (no login/dashboard, no support). Generic question headline.

**Why it feels generic**  
Every landing ends with “Ready to get started?”

**Recommended improvement**  
- Use `09_premium` for prestige tone.  
- Headline variant: “İlk avını at.” (action, not question).  
- Dual CTA: primary invite, secondary “Profilini gör” → `/login`.  
- Subcopy: one concrete step (“Botu ekle → kanal seç → `owl hunt`”).

---

## 9. Footer

**Current state**  
“OwlHunt · thetuncay.com” + link “Ops” → `/admin`.

**Problem**  
Public footer exposes admin entry. No privacy, terms, Discord, or support links.

**Why it feels generic**  
Minimal footer signals “side project”, not product.

**Recommended improvement**  
- Remove public Ops link (or move to env-gated dev footer).  
- Add: Destek, Gizlilik, Kullanım (even placeholder pages).  
- © + “Discord botu — thetuncay.com”.

---

## 10. Login (`/login`)

**Current state**  
Centered card, `01_normal`, “Discord ile bağlan”, Discord blue button, error states for oauth/state/config, `next` param for invite flow.

**Problem**  
Functional but bare. Discord button uses default blurple only element off-brand. No trust copy (what data is stored).

**Why it feels generic**  
Standard OAuth card — could be any Discord app.

**Recommended improvement**  
- Keep layout; add `08_protector` small + “Sadece Discord kimliğin — şifre saklanmaz.”  
- Style Discord button: keep blurple (users expect it) but gold border on card.  
- Loading: `12_loading` while redirecting.

---

## 11. Player dashboard (`/dashboard`)

**Current state**  
Session-gated. Hero: avatar, “Discord bağlı”, stats grid (8 metrics), “Ana baykuş” one line. Empty: plain text if not registered in game.

**Problem**  
- No loading skeleton (`12_loading`).  
- Empty state has no mascot (`04_sleeping`).  
- No link back to Discord (“Sunucunda oyna”).  
- Stats equal visual weight — no hero stat (level or rank).

**Why it feels generic**  
Generic “account dashboard” grid; could be any game API viewer.

**Recommended improvement**  
- Loading: `12_loading` + skeleton cards.  
- Empty: `04_sleeping` + steps (add bot → accept terms → `owl hunt`).  
- Highlight top 3 stats (Level, Coin, Av streak).  
- Show main owl with species image tier if available later.

---

## 12. Admin ops-panel (`/admin`)

**Current state**  
Separate design system: `#0f1419` bg, indigo `#6366f1` buttons, Segoe UI, 🦉 emoji logo. Guild grid, health JSON, Basic auth.

**Problem**  
**Complete brand break** from public site. Looks like a different product (generic DevOps dashboard).

**Why it feels generic**  
Indigo-on-slate is the default “admin template” palette (Tailwind UI, Vercel dashboard clones).

**Recommended improvement**  
- Reskin to site tokens: `#080808`, red/gold accents, Nunito + Source Sans 3.  
- Header: `07_developer` PNG instead of emoji.  
- Loading guilds: `12_loading`.  
- Keep layout and Basic auth — only visual + typography alignment.

---

## 13. Mobile experience (`@media max-width: 820px`)

**Current state**  
Nav wraps to second row; hero art moves above copy; single-column features.

**Problem**  
Nav order `order: 3` pushes links below CTAs — crowded header. Hero still tall; mood strip + features = long scroll to commands.

**Why it feels generic**  
Responsive stack without mobile-first prioritization.

**Recommended improvement**  
- Collapse nav to hamburger or drop “Özellikler/Komutlar” into footer on xs.  
- Hero: show hunt proof **above** fold before mascot on mobile.  
- Sticky bottom bar: “Sunucuya Ekle” on landing only.

---

## 14. Typography

**Current state**  
H1 clamp 2.2–3.1rem; feature H2 1.7rem; body 1.05–1.06rem; eyebrow 0.72rem uppercase.

**Problem**  
Limited scale (only 3 levels). Feature H2 all gold — no hierarchy between sections. Body muted color reduces readability on long paragraphs.

**Why it feels generic**  
Two-font Google pairing (rounded display + sans body) is overused in 2024–2026 bot landings.

**Recommended improvement**  
- Add type scale: `--text-xs` through `--text-3xl` in CSS.  
- Section labels: eyebrow style (gold, uppercase) before H2.  
- Body on features: bump to `#d4ccc4` or `1.08rem` for scanability.  
- Do **not** change font families.

---

## 15. Copywriting (site-wide)

**Current state**  
Turkish, playful (“Hu!”, “Hazır mısın?”), feature-list tone, some English in captions.

**Problem**  
Voice inconsistent with in-game klasik bot-style pipes (`🌙 |`) which are more technical/gamey.

**Why it feels generic**  
Marketing wrapper around a game that speaks differently in Discord.

**Recommended improvement**  
Align site voice with bot: direct, slightly playful, command-aware. See `docs/owlhunt-premium-upgrade-plan.md` Phase 4 for rewrites.

---

## 16. Information hierarchy

**Current state**  
Order: Hero → Mood → Features ×3 → Commands → CTA → Footer.

**Problem**  
User must scroll ~3–4 screens before seeing verifiable commands. Invite CTA appears twice before proof.

**Why it feels generic**  
Conversion-first bot landing prioritizes invite over understanding.

**Recommended improvement**  
Ideal order: Hero (with hunt proof) → Commands (quick start) → Features → Social proof → CTA.  
Or: hero CTA + inline command strip under lead.

---

## 17. Discord surfaces (not web, same journey)

### Hunt (`owl hunt`, `w hunt`)

**Current:** Plain text pipes `🌙 |`, `🦉 |`, biome embeds navy/green. Combo streak hidden.  
**Problem:** Best gameplay copy is here but absent from website. Colors ≠ brand red/gold.  
**Improvement:** Show hunt output on landing; map embed colors to `#9b1c1c` / `#f5c518` in `theme.ts`.

### Leaderboard (`/lb`)

**Current:** Embeds per category (power, hunt, relic, arena, wealth), Flat UI colors, 30min cache footer.  
**Problem:** Not on web — only mentioned. Rainbow embed colors feel like default Discord bot.  
**Improvement:** Optional future `/leaderboard` web view; until then, landing section with sample top-3 mock + link “Discord’da `/lb`”.

### Profile (`/owl stats` — not `/owl profile`)

**Current:** Rich embed, quality colors, footer streak hint.  
**Problem:** Site advertises wrong command. EN tier names (God Roll, Trash).  
**Improvement:** Fix site commands; Turkish quality labels where possible.

### Market (`/owl market`)

**Current:** ASCII box UI, strong structure.  
**Problem:** Lootbox lines in English (“opens”, “and finds”).  
**Improvement:** Full Turkish lootbox strings.

### Tame / zoo

**Current:** Tame narrative is best-written surface; zoo is plain text.  
**Problem:** Premium writing locked in Discord only.  
**Improvement:** Pull one tame quote onto landing as social proof.

### PvP / encounter / boss

**Current:** High energy, streak milestones (“TANRI MODU”).  
**Problem:** Some phrases feel generic gaming (“DÖVÜŞ BAŞLIYOR”).  
**Improvement:** Keep energy; tighten to OwlHunt verbs (av, iz, pençe).

### Moderation (`/owlonly`, admin)

**Current:** Clear Turkish admin copy; `failEmbed` Discord red.  
**Problem:** Permission embeds not using brand; site doesn’t mention mod tools for server owners.  
**Improvement:** Landing bullet for admins: `/owlonly` + `08_protector` visual.

---

# Phase 2 — AI slop signals

Patterns that make OwlHunt feel like “another AI startup / generated landing”:

| Signal | Where | Why it feels artificial |
|--------|--------|------------------------|
| Pun headline without substance | Hero “Hu! Bu ne?” | LLM-era hook; no product proof |
| Feature trio (3 blocks) | Sections A/B/C | Default generator structure |
| Unverified scale claims | “Yüzlerce av” | Marketing filler without numbers |
| Mascot-only “screenshots” | All feature frames | Template bot sites use PNG mascots instead of UI |
| Decorative mood strip | Below hero | Filler to occupy space |
| Generic CTA question | “Hazır mısın?” | Universal closing line |
| Wrong command names | `/owl shop`, `/owl profile` | Suggests copy never tested against product |
| English sprinkled in TR | “confetti”, lootbox opens | Breaks immersion; feels auto-translated |
| Alternating RTL feature rows | `.feature-b` | SaaS landing trope |
| Tilted cards + heavy shadow | `.shot-frame` | “Stylish” but cheap when overused |
| Discord blurple embeds | `theme.ts` PRIMARY | Every Discord bot; not OwlHunt |
| Indigo admin panel | `ops-panel/styles.css` | Different product identity |
| `:c` cooldown tone | `command-error.ts` | Fine for Discord culture; mismatches “premium” site tone |
| Help embed “(YENİ!)” + AI push | Help system | Startup marketing in-product |

**What is NOT slop (keep):**  
klasik bot-style pipe formatting, biome specificity, tame narrative prose, command grid concept, red/gold dark theme, owl expression art.

---

# Phase 5 — UX improvements

## Visual hierarchy

| Element | Today | After |
|---------|-------|-------|
| Primary focus | Hero H1 + owl art | Hunt proof + invite CTA |
| Secondary | Gold feature H2s | Section eyebrows + white H2 |
| Tertiary | Muted paragraphs | Command chips |
| Noise | Mood strip, spark owl | Remove or label |

## Spacing

- Increase section padding rhythm: `4rem` between major sections, `2rem` inside cards.  
- Reduce hero bottom padding when mood strip removed.  
- Dashboard: more gap between hero and stat grid.

## Typography scale (proposed)

```css
--text-xs: 0.72rem;   /* eyebrow */
--text-sm: 0.85rem;   /* captions */
--text-base: 1rem;    /* body */
--text-lg: 1.125rem;  /* lead */
--text-xl: 1.35rem;   /* card titles */
--text-2xl: 1.7rem;   /* section H2 */
--text-3xl: clamp(2rem, 5vw, 3rem); /* hero */
```

## Contrast & readability

- Muted `#9a8f88` on `#080808` ≈ 4.5:1 — borderline for small text. Use `#b5a99f` for body on dark sections.  
- Gold H2 on dark: add subtle `text-shadow` only on hero, not every section.

## Attention competition

**Competing today:** Gold nav button vs red hero button vs gold H2s vs mood strip motion vs floating owl animation.

**Fix:** One motion (hero float OR spark, not both). One gold emphasis per viewport.

## Weak CTAs

| CTA | Issue | Fix |
|-----|-------|-----|
| Sunucuya Ekle | Good primary | Add microcopy under button |
| Giriş Yap | Low contrast vs invite | Keep ghost; add to hero secondary |
| Destek | Hidden until config | Show in nav when available |
| Dashboard empty | No CTA | “Botu sunucuna ekle” button |

## Sections users will ignore

1. Mood strip (no info)  
2. Middle feature paragraph (skim)  
3. Footer (no links)  
4. Stat line if loading fails silently  

## Scanning behavior

Users scan: **logo → headline → button → images**.  
Put command grid higher or hunt mock in hero right column instead of second owl PNG.

---

# Phase 6 — Product-first experience

## Goal

Visitor understands **what playing feels like** before scrolling 2 screens.

## Metrics (audit)

| Metric | Current estimate | Target |
|--------|------------------|--------|
| Hero height | ~75vh (580px max) | 55–60vh |
| Scroll to commands | ~2.5 screens | 1 screen |
| Scroll to hunt proof | ~1 screen (feature A) | Above fold |
| Product screenshot | 0 | ≥1 (hunt output) |
| Time to “get it” | 8–12 sec | 3–5 sec |

## Hero height

Reduce `min-height: min(75vh, 580px)` → `min(58vh, 520px)`. Show feature A caption peeking.

## Product exposure

1. **Hero right:** Hunt result card (text mock from `hunt-ux.ts` style).  
2. **Commands:** Move `#komutlar` above `#ozellikler` in HTML order.  
3. **Dashboard:** After login, stats = product; optimize empty → first hunt.

## Discoverability

- Anchor link in hero: “Komutları gör”  
- Open Graph / meta: describe hunt loop, not “eğlenceli bot”  
- No fake counters, fake testimonials, or “X users online” widgets

## Discord as product surface

Leaderboards and hunts **are** the product for most users. Web is onboarding + profile mirror. Plan web accordingly — don’t fake a Product Hunt-style catalog.

---

# Phase 7 — Premium feel audit

## Borders

| Element | Current | Feel | Fix |
|---------|---------|------|-----|
| `shot-frame` | 3px gold + rotate | Sticker | 1–2px border, no rotate |
| `cmd-card` | 1px red 35% | OK | Slight inner glow on hover |
| `topbar` | 2px red solid | Strong brand | Keep |
| `auth-card` | 1px red 35% | OK | Keep |

## Shadows

| Element | Current | Feel | Fix |
|---------|---------|------|-----|
| Hero owl | `0 24px 48px` | OK | Reduce on mobile |
| `shot-frame` | `0 20px 50px` | Heavy | `0 8px 24px rgba(0,0,0,0.4)` |
| Primary button | 3D `4px 0` offset | Game UI | Softer: `0 2px 0` + subtle glow |

## Glassmorphism

`backdrop-filter: blur(10px)` on topbar only — **keep**, reads premium when not overused.

## Hover states

- Buttons: `translateY(-1px)` — keep.  
- Mood strip scale 1.08 — remove if strip removed.  
- Cmd-card: add gold border transition (already partial).

## Card hierarchy

- **Tier 1:** Hero hunt proof card  
- **Tier 2:** Command grid  
- **Tier 3:** Feature sections  
- **Tier 4:** CTA band  

Use surface `#121010` for tier 2–3; avoid identical borders on all.

## Loading states

| Surface | Current | Fix |
|---------|---------|-----|
| Stat line | “Sunucular yükleniyor…” | `12_loading` icon + skeleton text |
| Dashboard | “Yükleniyor…” text | Skeleton grid + loading owl |
| Ops panel | “Yükleniyor…” in pre | Spinner owl in header |

## Empty states

| Surface | Current | Fix |
|---------|---------|-----|
| Dashboard | Text only | `04_sleeping` + 3 steps + CTA |
| Ops guilds | Plain empty | `04_sleeping` + explanation |
| Leaderboard (Discord) | Text | Already OK; add owl on web if built |

## Cheap / template / over-designed

| Flag | Verdict |
|------|---------|
| Double owl in hero | Over-designed → one owl + product card |
| Rotate shot frames | Template → straighten |
| 3D button shadow | Game-cheap → refine |
| Indigo ops panel | Wrong brand → reskin |
| Confetti mascot everywhere | Over-designed → reserve for rare moments |
| Gold every H2 | Flat hierarchy → eyebrows |

## Premium references (same language)

- **Keep:** Dark bg, red rule, gold accent, painterly owl art, pipe hunt format.  
- **Add:** Restraint (fewer animations), real product text, consistent tokens across web + Discord + admin.

---

## Cross-surface brand consistency matrix

| Surface | Background | Accent | Mascot | Voice |
|---------|------------|--------|--------|-------|
| Landing | `#080808` | Red/gold | PNG set | Playful marketing |
| Login | Match | Match | `01_normal` | Neutral |
| Dashboard | Match | Match | `02_happy` | Sparse |
| Ops panel | `#0f1419` ❌ | Indigo ❌ | Emoji ❌ | Technical |
| Discord embeds | N/A | Blurple/rainbow ❌ | Emojis | Game/klasik bot |

**Target:** One row — all match landing tokens + functional mascot + game voice.

---

## Appendix — File reference

| File | Role |
|------|------|
| `public/site/index.html` | Landing structure |
| `public/site/styles.css` | Brand tokens |
| `public/site/login.html` | OAuth entry |
| `public/site/dashboard.html` | Player profile web |
| `public/ops-panel/index.html` | Admin UI |
| `public/ops-panel/styles.css` | Admin theme (off-brand) |
| `public/ops-panel/owlhuntweb/*.png` | Mascot system |
| `src/utils/theme.ts` | Discord embed colors |
| `src/utils/hunt-ux.ts` | Hunt copy |
| `src/utils/leaderboard-ux.ts` | `/lb` embeds |
| `src/ops/ops-http-server.ts` | Routes |

---

*Next: implementation priorities and copy variants in `docs/owlhunt-premium-upgrade-plan.md`.*
