"""Step 3: language content. One LLM call per song returning strict JSON per
line (romanization, phonetic respelling, word glosses, translation) plus a
grammar-complexity rating used by the difficulty score.

Uses Claude via the Anthropic SDK. Without ANTHROPIC_API_KEY (or with
--skip-llm) it falls back to rule-based romanization/phonetics and leaves
translations and glosses empty, so the rest of the pipeline still runs.
"""
from __future__ import annotations

import json
import re

from jsonschema import Draft202012Validator

from common import env, tokenize

MAX_ATTEMPTS = 3
LANG_NAMES = {"es": "Spanish", "hi": "Hindi"}

SCHEMA = {
    "type": "object",
    "required": ["grammarComplexity", "lines"],
    "additionalProperties": False,
    "properties": {
        "grammarComplexity": {"type": "integer", "minimum": 1, "maximum": 10},
        "grammarNotes": {"type": "string"},
        "lines": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "original", "romanized", "phonetic", "translation", "words"],
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "integer", "minimum": 0},
                    "original": {"type": "string", "minLength": 1},
                    "romanized": {"type": "string"},
                    "phonetic": {"type": "string", "minLength": 1},
                    "translation": {"type": "string", "minLength": 1},
                    "words": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "required": ["text", "romanized", "phonetic", "gloss"],
                            "additionalProperties": False,
                            "properties": {
                                "text": {"type": "string", "minLength": 1},
                                "romanized": {"type": "string"},
                                "phonetic": {"type": "string", "minLength": 1},
                                "gloss": {"type": "string", "minLength": 1},
                            },
                        },
                    },
                },
            },
        },
    },
}
_validator = Draft202012Validator(SCHEMA)

SYSTEM = """You prepare song lyrics for a language-learning app. The learner is a native English speaker who reads no other script and knows no phonetic alphabet. You reply with a single JSON object and nothing else."""


def build_prompt(meta: dict, unique_lines: list[str]) -> str:
    lang = LANG_NAMES[meta["language"]]
    items = [{"id": i, "original": text, "tokens": tokenize(text)} for i, text in enumerate(unique_lines)]
    romanized_rule = (
        'the line in Latin script with standard diacritics (for example नमस्ते -> "namaste")'
        if meta["language"] == "hi"
        else 'an empty string "" (Spanish is already in Latin script)'
    )
    return f"""Song: "{meta['title']}" by {meta['artist']}. Language: {lang}.

Below are the song's distinct lyric lines. Each has an id, the original text, and its whitespace tokens. The app highlights words in time with the music using those exact tokens, so the word list you return for a line must have exactly one entry per token, in the same order.

For every line return:
- "id": the id you were given.
- "original": the original text, unchanged.
- "romanized": {romanized_rule}.
- "phonetic": a respelling an English reader can sound out with no training, hyphens between syllables, the stressed syllable of each word in CAPS. Spell sounds the way English does ("Hoy hay huevos" -> "oy eye WEH-bos"). No IPA symbols and no diacritics.
- "translation": a natural English translation of the whole line, the way a good subtitle would read (not word for word).
- "words": one object per token with "text" (the token as given, punctuation included), "romanized" (same rule as the line), "phonetic" (same style as the line), and "gloss" (the word's meaning in this line in one to four English words; for "mi amor" the glosses are "my" and "love"). For words with no direct English meaning, say what they do, such as "(object marker)".

Also return, for the song as a whole:
- "grammarComplexity": an integer from 1 to 10 for how hard the grammar is for a beginner. 1 is present-tense simple sentences; 10 is dense subjunctive, compound tenses, or heavy idiom.
- "grammarNotes": one sentence naming the main grammar features that drive that rating.

Reply with one JSON object of this shape and no other text:
{{"grammarComplexity": 4, "grammarNotes": "...", "lines": [{{"id": 0, "original": "...", "romanized": "...", "phonetic": "...", "translation": "...", "words": [{{"text": "...", "romanized": "...", "phonetic": "...", "gloss": "..."}}]}}]}}

Lines:
{json.dumps(items, ensure_ascii=False, indent=1)}"""


def validate(data, unique_lines: list[str]) -> list[str]:
    """Schema check plus the cross-checks a schema cannot express."""
    errors = [f"{'/'.join(map(str, e.path)) or '(root)'}: {e.message}" for e in _validator.iter_errors(data)]
    if errors:
        return errors[:20]
    by_id = {line["id"]: line for line in data["lines"]}
    for i, text in enumerate(unique_lines):
        if i not in by_id:
            errors.append(f"line id {i} is missing")
            continue
        want, got = len(tokenize(text)), len(by_id[i]["words"])
        if want != got:
            errors.append(f"line id {i}: expected {want} words (one per token {tokenize(text)}), got {got}")
    return errors[:20]


def _extract_json(text: str):
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("no JSON object in the reply")
    return json.loads(text[start:end + 1])


def _call_claude(client, model: str, messages: list[dict]):
    """Streams (long outputs) and returns the final message. Asks the API to
    reroute to a fallback model if the primary declines; if this model or
    account does not accept that option, repeats the request without it."""
    import anthropic

    kwargs = dict(model=model, max_tokens=64000, system=SYSTEM, messages=messages, output_config={"effort": "medium"})
    if env("ANTHROPIC_FALLBACKS", "1") != "0":
        try:
            with client.beta.messages.stream(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs) as stream:
                return stream.get_final_message()
        except (anthropic.BadRequestError, TypeError) as err:
            print(f"[content] refusal-fallback option not accepted ({err}); retrying without it")
    with client.messages.stream(**kwargs) as stream:
        return stream.get_final_message()


def generate_with_llm(meta: dict, unique_lines: list[str]) -> dict:
    import anthropic

    client = anthropic.Anthropic()
    model = env("ANTHROPIC_MODEL", "claude-opus-5-5")
    messages: list[dict] = [{"role": "user", "content": build_prompt(meta, unique_lines)}]
    last_errors: list[str] = []
    for attempt in range(1, MAX_ATTEMPTS + 1):
        print(f"[content] asking {model} for {len(unique_lines)} distinct lines (attempt {attempt}/{MAX_ATTEMPTS})")
        response = _call_claude(client, model, messages)
        if response.stop_reason == "refusal":
            raise RuntimeError("The model declined to process these lyrics")
        reply = "".join(b.text for b in response.content if b.type == "text")
        try:
            if response.stop_reason == "max_tokens":
                raise ValueError("reply was cut off at max_tokens")
            data = _extract_json(reply)
            last_errors = validate(data, unique_lines)
        except ValueError as err:  # includes json.JSONDecodeError
            data, last_errors = None, [f"invalid JSON: {err}"]
        if not last_errors:
            return data
        print(f"[content] reply failed validation: {last_errors[:3]}")
        messages += [
            {"role": "assistant", "content": reply or "(empty)"},
            {"role": "user", "content": "That reply did not validate:\n- " + "\n- ".join(last_errors)
             + "\nSend the complete corrected JSON object again, with no other text."},
        ]
    raise RuntimeError(f"LLM content failed validation after {MAX_ATTEMPTS} attempts: {last_errors}")


# ---------- rule-based fallback (no LLM) ----------

_DEV_CONS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h",
}
_DEV_VOWELS = {"अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au"}
_DEV_MATRAS = {"ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au"}


def romanize_hindi(word: str) -> str:
    out: list[str] = []
    pending_a = False  # consonant waiting for its inherent "a"
    for ch in word:
        if ch in _DEV_CONS:
            if pending_a:
                out.append("a")
            out.append(_DEV_CONS[ch])
            pending_a = True
        elif ch in _DEV_MATRAS:
            out.append(_DEV_MATRAS[ch])
            pending_a = False
        elif ch == "्":
            pending_a = False
        elif ch in _DEV_VOWELS:
            if pending_a:
                out.append("a")
            out.append(_DEV_VOWELS[ch])
            pending_a = False
        elif ch in "ंँ":
            if pending_a:
                out.append("a")
            out.append("n")
            pending_a = False
        elif ch == "़":
            continue
        else:
            pending_a = False  # word-final inherent "a" is silent in Hindi
            out.append(ch)
    return "".join(out)


def respell_spanish(word: str) -> str:
    """Very rough English-style respelling (no stress marks). The LLM does this properly."""
    w = word.lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ü", "u")):
        w = w.replace(a, b)
    w = re.sub(r"(?<!c)h", "", w)  # h is silent except in "ch"
    for a, b in (("que", "keh"), ("qui", "kee"), ("gue", "geh"), ("gui", "gee"), ("ll", "y"), ("ñ", "ny"), ("ch", "CH"),
                 ("ge", "heh"), ("gi", "hee"), ("j", "h"), ("ce", "seh"), ("ci", "see"), ("z", "s"), ("v", "b")):
        w = w.replace(a, b)
    return w.replace("c", "k").replace("CH", "ch")


def generate_fallback(meta: dict, unique_lines: list[str]) -> dict:
    hindi = meta["language"] == "hi"
    lines = []
    for i, text in enumerate(unique_lines):
        words = []
        for tok in tokenize(text):
            rom = romanize_hindi(tok) if hindi else ""
            words.append({"text": tok, "romanized": rom, "phonetic": rom if hindi else respell_spanish(tok), "gloss": ""})
        lines.append({
            "id": i, "original": text,
            "romanized": " ".join(w["romanized"] for w in words) if hindi else "",
            "phonetic": " ".join(w["phonetic"] for w in words),
            "translation": "", "words": words,
        })
    return {"grammarComplexity": 5, "grammarNotes": "Not rated (no LLM key).", "lines": lines}


def generate(meta: dict, line_texts: list[str], skip_llm: bool = False) -> tuple[list[dict], dict]:
    """Returns (per-line content in input order, {grammarComplexity, grammarNotes, source})."""
    unique = list(dict.fromkeys(line_texts))  # choruses repeat; only pay for each line once
    if skip_llm or not env("ANTHROPIC_API_KEY"):
        why = "--skip-llm" if skip_llm else "ANTHROPIC_API_KEY is not set"
        print(f"[content] {why}: using rule-based phonetics, no translations or glosses")
        data, source = generate_fallback(meta, unique), "rules"
    else:
        data, source = generate_with_llm(meta, unique), "llm"
    by_text = {unique[line["id"]]: line for line in data["lines"] if line["id"] < len(unique)}
    info = {"grammarComplexity": data["grammarComplexity"], "grammarNotes": data.get("grammarNotes", ""), "source": source}
    return [by_text[t] for t in line_texts], info
