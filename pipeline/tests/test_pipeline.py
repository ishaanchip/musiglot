"""Offline unit tests: python -m unittest discover pipeline/tests"""
import json
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import align  # noqa: E402
import content  # noqa: E402
import lrclib  # noqa: E402
from common import count_syllables, normalize  # noqa: E402


class LrcParsing(unittest.TestCase):
    def test_parse_lrc(self):
        lrc = "[ar:Someone]\n[00:10.50] Primera línea\n[00:14.00]\n[00:20.00][00:40.00] Repetida\n[00:25.00] ♪\n[00:30.00] (Instrumental)\n"
        lines = lrclib.parse_lrc(lrc, song_end=60)
        self.assertEqual([l["text"] for l in lines], ["Primera línea", "Repetida", "Repetida"])
        self.assertEqual((lines[0]["start"], lines[0]["end"]), (10.5, 14.0))  # ends at the empty timestamp
        self.assertEqual((lines[1]["start"], lines[1]["end"]), (20.0, 25.0))
        self.assertEqual((lines[2]["start"], lines[2]["end"]), (40.0, 60.0))  # last line runs to song end

    def test_choose_search_result(self):
        results = [
            {"id": 1, "duration": 200, "plainLyrics": "x", "syncedLyrics": None},
            {"id": 2, "duration": 185, "syncedLyrics": "[00:01.00] x"},
            {"id": 3, "duration": 199, "syncedLyrics": "[00:01.00] x"},
            {"id": 4, "duration": 200, "instrumental": True},
        ]
        self.assertEqual(lrclib.choose_search_result(results, 200)["id"], 3)
        self.assertIsNone(lrclib.choose_search_result([results[3]], 200))

    def test_fetch_order_and_cache(self):
        calls = []

        def fake_get(path, params=None):
            calls.append(path)
            if path == "/search":
                return [{"id": 9, "duration": 100, "syncedLyrics": "[00:01.00] hola", "trackName": "t", "artistName": "a"}]
            return None

        import tempfile

        with tempfile.TemporaryDirectory() as d, mock.patch.object(lrclib, "_get", fake_get):
            cache = Path(d) / "lrclib.json"
            rec = lrclib.fetch({"title": "t", "artist": "a", "lrclibId": 5}, 100.0, cache)
            self.assertEqual(calls, ["/get/5", "/get", "/search"])
            self.assertEqual(rec["id"], 9)
            calls.clear()
            self.assertEqual(lrclib.fetch({"title": "t", "artist": "a"}, 100.0, cache)["id"], 9)
            self.assertEqual(calls, [])  # served from cache


class Alignment(unittest.TestCase):
    def test_text_helpers(self):
        self.assertEqual(normalize("¡Corazón, mío!"), "corazon mio")
        self.assertEqual(normalize("रानी है।"), "रानी है")
        self.assertEqual(count_syllables("corazón"), 3)
        self.assertEqual(count_syllables("मछली"), 3)

    def test_match_tokens_uses_asr_times_but_keeps_lyrics(self):
        tokens = ["Como", "la", "flor,", "con", "tanto", "amor"]
        asr = [{"word": w, "start": i, "end": i + 0.5} for i, w in enumerate(["eh", "como", "la", "floor", "tanto", "amor"])]
        self.assertEqual(align.match_tokens(tokens, asr), [1, 2, 3, None, 4, 5])

    def test_align_words_with_and_without_asr(self):
        times = np.arange(0, 20, 0.02)
        rms = np.where((times >= 2.5) & (times <= 5.5), 1.0, 0.0)
        line = {"start": 2.0, "end": 7.0, "text": "uno dos tres"}
        align.align_words([line], None, rms, times, 20.0)
        w = line["words"]
        self.assertEqual([x["text"] for x in w], ["uno", "dos", "tres"])
        self.assertAlmostEqual(w[0]["start"], 2.5, delta=0.05)
        self.assertAlmostEqual(w[-1]["end"], 5.5, delta=0.1)
        self.assertTrue(all(a["start"] <= b["start"] for a, b in zip(w, w[1:])))

        asr = [{"word": "uno", "start": 2.6, "end": 3.0}, {"word": "tres", "start": 4.8, "end": 5.4}]
        stats = align.align_words([line], asr, rms, times, 20.0)
        self.assertEqual(stats["matchedByAsr"], 2)
        self.assertEqual((line["words"][0]["start"], line["words"][2]["start"]), (2.6, 4.8))
        self.assertEqual((line["words"][1]["start"], line["words"][1]["end"]), (3.0, 4.8))  # interpolated between neighbors

    def test_lines_from_scratch(self):
        times = np.arange(0, 20, 0.02)
        rms = np.where(((times >= 2) & (times <= 5)) | ((times >= 10) & (times <= 13)), 1.0, 0.0)
        lines = align.align_lines_from_scratch(["la la la", "na na na"], None, rms, times, 20.0)
        self.assertAlmostEqual(lines[0]["start"], 2.0, delta=0.1)
        self.assertAlmostEqual(lines[1]["start"], 10.0, delta=0.1)
        self.assertEqual(lines[0]["end"], lines[1]["start"])


def reply(obj):
    return types.SimpleNamespace(stop_reason="end_turn", content=[types.SimpleNamespace(type="text", text=json.dumps(obj, ensure_ascii=False))])


class Content(unittest.TestCase):
    META = {"title": "T", "artist": "A", "language": "es"}
    GOOD = {"grammarComplexity": 3, "grammarNotes": "Present tense.", "lines": [{
        "id": 0, "original": "mi amor", "romanized": "", "phonetic": "mee ah-MOR", "translation": "my love",
        "words": [{"text": "mi", "romanized": "", "phonetic": "mee", "gloss": "my"},
                  {"text": "amor", "romanized": "", "phonetic": "ah-MOR", "gloss": "love"}]}]}

    def test_validation_catches_token_mismatch(self):
        self.assertEqual(content.validate(self.GOOD, ["mi amor"]), [])
        bad = json.loads(json.dumps(self.GOOD))
        bad["lines"][0]["words"].pop()
        self.assertIn("expected 2 words", content.validate(bad, ["mi amor"])[0])
        self.assertTrue(content.validate({"lines": []}, ["mi amor"]))

    def test_retries_then_dedupes_repeated_lines(self):
        bad = json.loads(json.dumps(self.GOOD))
        del bad["lines"][0]["translation"]
        replies = [reply(bad), reply(self.GOOD)]
        seen = []

        def fake_call(client, model, messages):
            seen.append(len(messages))
            return replies.pop(0)

        fake_anthropic = types.SimpleNamespace(Anthropic=lambda: object())
        with mock.patch.dict(sys.modules, {"anthropic": fake_anthropic}), mock.patch.object(content, "_call_claude", fake_call), \
                mock.patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test"}):
            lines, info = content.generate(self.META, ["mi amor", "mi amor"])
        self.assertEqual(seen, [1, 3])  # second call carries the failed reply + the validation errors
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[1]["translation"], "my love")
        self.assertEqual(info, {"grammarComplexity": 3, "grammarNotes": "Present tense.", "source": "llm"})

    def test_rule_based_fallback(self):
        self.assertEqual(content.romanize_hindi("नमस्ते"), "namaste")
        self.assertEqual(content.romanize_hindi("रानी"), "raanee")
        self.assertEqual(content.romanize_hindi("जल"), "jal")
        lines, info = content.generate({"title": "T", "artist": "A", "language": "hi"}, ["मछली जल"], skip_llm=True)
        self.assertEqual(info["source"], "rules")
        self.assertEqual(len(lines[0]["words"]), 2)


if __name__ == "__main__":
    unittest.main()
