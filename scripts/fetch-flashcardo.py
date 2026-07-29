#!/usr/bin/env python3
"""Fetch Russian→Spanish topic flashcards from Flashcardo and write seed JSON."""

from __future__ import annotations

import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "flashcardo-topics.json"

TOPICS = [
    ("osnovy", "Основы", "📚", "#087d86"),
    ("chisla", "Числа", "🔢", "#3b82f6"),
    ("glagoly", "Глаголы", "🏃", "#f59e0b"),
    ("prilagatelnye", "Прилагательные", "🎨", "#ec4899"),
    ("sport", "Спорт", "⚽", "#22c55e"),
    ("zhivotnye", "Животные", "🐾", "#a855f7"),
    ("strany", "Страны", "🌍", "#0ea5e9"),
    ("telo", "Тело", "🧍", "#f97316"),
    ("dom", "Дом", "🏠", "#14b8a6"),
    ("yeda", "Еда", "🍽", "#ff5a45"),
    ("shkola", "Школа", "🏫", "#6366f1"),
    ("priroda", "Природа", "🌿", "#84cc16"),
    ("transport", "Транспорт", "🚌", "#06b6d4"),
    ("gorod", "Город", "🏙", "#64748b"),
    ("bolnitsa", "Больница", "🏥", "#ef4444"),
    ("professii", "Профессии", "💼", "#8b5cf6"),
    ("biznes", "Бизнес", "📈", "#0f766e"),
    ("ustroystva", "Устройства", "📱", "#475569"),
]


def fetch(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; PalabraImporter/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read().decode("utf-8", "ignore")


def extract_cards(html: str) -> list[dict]:
    match = re.search(r"var cards = (\[.*?\]);var counter", html)
    if not match:
        match = re.search(r"var cards = (\[.*?\]);", html)
    if not match:
        return []
    return json.loads(match.group(1))


def spanish_to_cyrillic(text: str) -> str:
    """Approximate Spanish pronunciation in Cyrillic for Russian learners."""
    value = text.strip().lower()
    value = (
        value.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ü", "u")
        .replace("¿", "")
        .replace("¡", "")
        .replace("?", "")
        .replace("!", "")
        .replace(".", "")
        .replace(",", "")
        .replace(";", "")
        .replace(":", "")
    )

    # Keep common function words as set phrases used in the app samples.
    replacements = {
        "el": "эль",
        "la": "ла",
        "los": "лос",
        "las": "лас",
        "un": "ун",
        "una": "уна",
        "unos": "унос",
        "unas": "унас",
        "y": "и",
        "o": "о",
        "de": "де",
        "del": "дель",
        "al": "аль",
        "en": "эн",
        "con": "кон",
        "por": "пор",
        "para": "пара",
    }

    words = []
    for raw_word in value.split():
        if raw_word in replacements:
            words.append(replacements[raw_word])
            continue
        words.append(transliterate_word(raw_word))
    return " ".join(words)


def transliterate_word(value: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(value):
        ch = value[i]
        nxt = value[i + 1] if i + 1 < len(value) else ""
        nxt2 = value[i + 2] if i + 2 < len(value) else ""

        if ch == "c" and nxt == "h":
            out.append("ч")
            i += 2
            continue
        if ch == "l" and nxt == "l":
            out.append("й")
            i += 2
            continue
        if ch == "r" and nxt == "r":
            out.append("рр")
            i += 2
            continue
        if ch == "q" and nxt == "u":
            out.append("к")
            i += 2
            continue
        if ch == "g" and nxt == "u" and nxt2 in "ei":
            out.append("г")
            i += 2
            continue
        if ch == "g" and nxt in "ei":
            out.append("х")
            i += 1
            continue
        if ch == "c" and nxt in "ei":
            out.append("с")
            i += 1
            continue
        if ch == "h" and nxt == "u" and nxt2 == "e":
            out.append("уэ")
            i += 3
            continue
        if ch == "ñ":
            out.append("нь")
            i += 1
            continue
        if ch == "h":
            i += 1
            continue
        if ch == "x":
            out.append("кс")
            i += 1
            continue
        if ch == "y":
            out.append("й")
            i += 1
            continue
        if ch == "z":
            out.append("с")
            i += 1
            continue
        if ch == "u" and nxt == "e" and (not out):
            out.append("уэ")
            i += 2
            continue

        mapping = {
            "a": "а",
            "b": "б",
            "c": "к",
            "d": "д",
            "e": "е",
            "f": "ф",
            "g": "г",
            "i": "и",
            "j": "х",
            "k": "к",
            "l": "л",
            "m": "м",
            "n": "н",
            "o": "о",
            "p": "п",
            "r": "р",
            "s": "с",
            "t": "т",
            "u": "у",
            "v": "в",
            "w": "в",
            "-": "-",
            "'": "",
        }
        out.append(mapping.get(ch, ch))
        i += 1

    return "".join(out)


def spanish_phrase(card: dict) -> str:
    parts = [card.get("prew") or "", card.get("word") or "", card.get("postw") or ""]
    return " ".join(part.strip() for part in parts if part and part.strip()).strip()


def main() -> None:
    lists = []
    for slug, title, icon, color in TOPICS:
        url = f"https://flashcardo.com/ru/ispanskiye-kartochki/{slug}/1"
        print(f"fetch {title} ({slug})...")
        html = fetch(url)
        cards = extract_cards(html)
        words = []
        for card in cards:
            es = spanish_phrase(card)
            ru = (card.get("from") or "").strip()
            if not es or not ru:
                continue
            audio = card.get("audio") or ""
            sid_audio = card.get("sid_audio")
            words.append(
                {
                    "ru": ru,
                    "es": es,
                    "esPronunciation": spanish_to_cyrillic(es),
                    "esAudioUrl": f"https://flashcardo.com/audio/{sid_audio}/{audio}.mp3" if audio and sid_audio else "",
                    "hint": (card.get("fromhint") or "").strip(),
                    "sourceId": card.get("id"),
                }
            )
        lists.append(
            {
                "slug": slug,
                "title": title,
                "icon": icon,
                "color": color,
                "isGlobal": True,
                "source": "flashcardo",
                "words": words,
            }
        )
        print(f"  -> {len(words)} words")
        time.sleep(0.35)

    payload = {
        "source": "https://flashcardo.com/ru/ispanskiye-kartochki/",
        "importedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lists": lists,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(len(item["words"]) for item in lists)
    print(f"Wrote {OUT} ({len(lists)} lists, {total} words)")


if __name__ == "__main__":
    main()
