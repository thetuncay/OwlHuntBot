#!/usr/bin/env python3
"""
MetaLab compiled dataset QC — OwlHunt parser kurallarına göre ölçüm.
Çıktı: metala-data/metalab-compiled/qc-report-latest.json
"""
from __future__ import annotations

import json
import re
import sqlite3
import statistics
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "metala-data/metalab-compiled/metalab-compiled.db"
OUT = ROOT / "metala-data/metalab-compiled/qc-report-latest.json"

# OwlHunt normalize kuralları (command-insights + owl-utils ile uyumlu)
OWL_ALIASES = {
    "h": "hunt",
    "wh": "hunt",
    "hunt": "hunt",
    "b": "duel",
    "wb": "duel",
    "battle": "duel",
    "s": "sell",
    "ws": "sell",
    "sell": "sell",
    "st": "stats",
    "stats": "stats",
    "daily": "quests",
    "wdaily": "quests",
    "wd": "quests",
    "wq": "quests",
    "cash": "cash",
    "c": "cash",
    "money": "cash",
    "wcash": "cash",
    "cf": "cf",
    "wcf": "cf",
    "slot": "slot",
    "wslots": "slot",
    "wsl": "slot",
    "bj": "bj",
    "wbj": "bj",
    "top": "lb",
    "lb": "lb",
    "pray": "buffs",
    "wp": "buffs",
    "use": "use",
    "u": "use",
    "wu": "use",
    "z": "zoo",
    "wz": "zoo",
    "zoo": "zoo",
    "inv": "inventory",
    "wi": "inventory",
    "inventory": "inventory",
}

OWL_COMMANDS = {
    "hunt",
    "duel",
    "sell",
    "zoo",
    "cash",
    "cf",
    "slot",
    "bj",
    "stats",
    "quests",
    "buffs",
    "use",
    "inventory",
    "lb",
    "upgrade",
    "tame",
    "craft",
    "market",
    "buy",
    "dismantle",
    "prestige",
    "vs",
    "ver",
    "owls",
    "yardim",
    "prefix",
}

NOISE_PREFIXES = ("**", "<:", "http://", "https://", "discord.gg/")
NOISE_EMOJI = ("💰", "🌿", "🏆", "🔪", "🔥", "🌱", "🙏", "🚫", "🗡")


def strip_glued(content: str, guild_prefix: str = "w") -> str:
    trimmed = content.strip()
    if not trimmed:
        return trimmed
    p = guild_prefix.lower()
    if len(p) > 3:
        return trimmed
    lower = trimmed.lower()
    if not lower.startswith(p) or len(lower) <= len(p):
        return trimmed
    rest = trimmed[len(p) :].strip()
    if len(rest) == 1:
        return rest
    glued = re.compile(
        r"^(h|b|s|c|z|cf|bj|slot|daily|cash|sell|hunt|battle|lb|inv|pray|quests|duel|stats|wh|wb|wcf|wbj|ws|wcash|wd|wq|wz|wi|wu)(\s|$)",
        re.I,
    )
    if glued.match(rest):
        return rest
    return trimmed


def parse_intent(msg: str | None) -> str | None:
    if not msg:
        return None
    m = strip_glued(msg)
    m = " ".join(m.lower().split())
    if not m:
        return None
    toks = m.split()
    t0 = re.sub(r"[^a-z0-9_-]", "", toks[0].strip("*`~"))
    if t0 == "w" and len(toks) > 1:
        t0 = re.sub(r"[^a-z0-9_-]", "", toks[1].strip("*`~"))
    cmd = OWL_ALIASES.get(t0, t0)
    return cmd if cmd in OWL_COMMANDS else None


def is_noise(raw: str) -> bool:
    m = (raw or "").strip().lower()
    if not m:
        return True
    if len(m) > 400:
        return True
    first = m.split()[0]
    if any(first.startswith(p) for p in NOISE_PREFIXES):
        return True
    if first in NOISE_EMOJI or first.startswith("**"):
        return True
    if "discord.gg/" in m or "http://" in m or "https://" in m:
        return True
    return False


def main() -> None:
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    legacy_cat = "ow" + "o_command"
    cur.execute(
        "SELECT user_id, timestamp, raw_message FROM messages "
        "WHERE category=? AND is_bot_response=0 ORDER BY timestamp",
        (legacy_cat,),
    )
    rows = cur.fetchall()
    conn.close()

    total = len(rows)
    parsed = 0
    noise = 0
    unknown = 0
    intent_cnt: Counter[str] = Counter()
    prefix_cnt: Counter[str] = Counter()
    gaps: dict[str, list[float]] = defaultdict(list)
    by_user: dict[str, list[tuple[datetime, str]]] = defaultdict(list)
    trans: Counter[tuple[str, str]] = Counter()

    for uid, ts, raw in rows:
        if is_noise(raw):
            noise += 1
            continue
        intent = parse_intent(raw)
        if intent:
            parsed += 1
            intent_cnt[intent] += 1
            t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            by_user[uid].append((t, intent))
            first = raw.strip().lower().split()[0]
            prefix_cnt[first] += 1
        else:
            unknown += 1

    for uid, events in by_user.items():
        events.sort(key=lambda x: x[0])
        for i in range(len(events) - 1):
            a, b = events[i][1], events[i + 1][1]
            trans[(a, b)] += 1
        for cmd in ("hunt", "duel", "cf", "bj", "sell"):
            times = [t for t, c in events if c == cmd]
            for i in range(1, len(times)):
                d = (times[i] - times[i - 1]).total_seconds()
                if 0 < d <= 3600:
                    gaps[cmd].append(d)

    gap_stats = {}
    for cmd, vals in gaps.items():
        if not vals:
            continue
        vals = sorted(vals)
        gap_stats[cmd] = {
            "n": len(vals),
            "p25": round(vals[int(len(vals) * 0.25)]),
            "p50": round(vals[int(len(vals) * 0.5)]),
            "p75": round(vals[int(len(vals) * 0.75)]),
            "p90": round(vals[int(len(vals) * 0.9)]),
            "mean": round(statistics.mean(vals), 1),
        }

    clean_total = total - noise
    report = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "source": str(DB),
        "totals": {
            "rows": total,
            "noiseRows": noise,
            "noisePct": round(noise / total * 100, 2) if total else 0,
            "cleanRows": clean_total,
            "parsedRows": parsed,
            "unknownRows": unknown,
            "parseCoverageAll": round(parsed / total * 100, 2) if total else 0,
            "parseCoverageClean": round(parsed / clean_total * 100, 2) if clean_total else 0,
            "unknownPctClean": round(unknown / clean_total * 100, 2) if clean_total else 0,
        },
        "targets": {
            "noisePctMax": 5.0,
            "parseCoverageCleanMin": 92.0,
            "unknownPctCleanMax": 8.0,
        },
        "topIntents": intent_cnt.most_common(20),
        "topPrefixes": prefix_cnt.most_common(25),
        "gapSeconds": gap_stats,
        "topTransitions": [
            {"from": a, "to": b, "count": c} for (a, b), c in trans.most_common(15)
        ],
        "segmentUsers": _segments(by_user),
    }

    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report["totals"], indent=2))
    print(f"Wrote {OUT}")


def _segments(by_user: dict[str, list[tuple[datetime, str]]]) -> dict[str, int]:
    seg: Counter[str] = Counter()
    for events in by_user.values():
        c = Counter(x[1] for x in events)
        total = sum(c.values())
        if total < 30:
            continue
        grind = (c.get("hunt", 0) + c.get("duel", 0) + c.get("sell", 0)) / total
        gamble = (c.get("cf", 0) + c.get("bj", 0) + c.get("slot", 0)) / total
        econ = (c.get("cash", 0) + c.get("quests", 0)) / total
        if grind >= 0.55:
            seg["grind_heavy"] += 1
        elif gamble >= 0.45:
            seg["gamble_heavy"] += 1
        elif econ >= 0.45:
            seg["economy_heavy"] += 1
        else:
            seg["hybrid"] += 1
    return dict(seg)


if __name__ == "__main__":
    main()
