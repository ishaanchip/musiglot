# Musiglot

Learn Spanish or Hindi by singing along to songs. The app shows synced lyrics with translations and pronunciation help, records you while you sing, and grades pronunciation and pitch/timing (0–10 each) with short, specific feedback.

- `client/`: React (Vite) app
- `server/`: Node + Express API, MongoDB (Mongoose), JWT auth
- `pipeline/`: Python scripts, run once per song, that build the Song document and media
- `songs/<slug>/`: your inputs for each song (audio is not committed)
- `media/<slug>/`: generated audio, line clips and pitch data (not committed)

## Quick start

Requirements: Node 20+, Python 3.10+, MongoDB, and `ffmpeg` on your PATH.

```bash
cp .env.example .env
```

```bash
docker compose up -d
```

```bash
npm run install:all
```

```bash
npm run seed
```

```bash
npm run dev
```

Open http://localhost:5173. `docker compose up -d` starts a local MongoDB; skip it if you already have one and set `MONGODB_URI`. `npm run seed` adds a demo Hindi song with stub audio and a demo login (`demo@musiglot.test` / `demo1234`), so the whole flow works with no keys and no real songs.

Use Chrome or Edge with headphones. The app needs microphone access, which browsers only allow on `localhost` or HTTPS.

## Adding a song

1. Make a folder `songs/<slug>/` containing:
   - `instrumental.mp3`: the backing track
   - `vocals.mp3`: the isolated vocal
   - `full.mp3` (optional): the original full mix, vocals plus music. Used for "Listen first" and guide vocals. It must be the same recording the stems came from so the timing matches. Without it the app plays the two stems together instead.
   - `meta.json`: `{ "title", "artist", "album", "language": "es" | "hi" }`, plus optional `"lrclibId"` to pin an exact LRCLIB entry and `"offsetMs"` to shift the lyric timing by hand
   - `lyrics.lrc` or `lyrics.txt` (optional): manual override, used only if LRCLIB has nothing usable
2. Set up the pipeline once:

```bash
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
```

3. Run it:

```bash
.venv/bin/python pipeline/process_song.py songs/<slug>
```

No code changes are needed. `songs/como-la-flor/meta.json` is already in the repo; drop `instrumental.mp3` and `vocals.mp3` next to it and run the command above.

To add `full.mp3` to a song you already processed, without redoing the other steps:

```bash
.venv/bin/python pipeline/process_song.py songs/<slug> --full-only
```

The run prints the chosen LRCLIB ID, whether it shifted the timing, and the first few lines with word timestamps so you can sanity-check them. Useful flags: `--no-db` (write `media/<slug>/song.json` only), `--skip-llm`, `--refresh` (ignore cached LRCLIB / Whisper / LLM results).

### What the pipeline does

| Step | What happens | File |
|---|---|---|
| 1. Lyrics | LRCLIB `GET /api/get/{id}` if pinned, else `/api/get` by title/artist/album/duration, else `/api/search` (closest duration with synced lyrics). Falls back to plain lyrics, then your local override. The raw response is cached in `songs/<slug>/lrclib.json`. Empty and instrumental-marker lines are dropped. | `lrclib.py` |
| 2. Alignment | Checks vocal energy at each line start and applies one global shift if the timing is consistently off (or uses `offsetMs` from `meta.json`). Word timestamps come from Whisper word timings matched to the lyric tokens inside each line's window (±1 s). The LRCLIB text is never replaced by what Whisper heard. Without Whisper, words are spread over the sung part of the line by syllable count. Without synced lyrics, whole lines are placed from scratch. | `align.py`, `asr.py` |
| 3. Language content | One Claude call per song returns JSON per line (romanization for Hindi, phonetic respelling, word glosses, translation) plus a grammar rating. The reply is validated against a JSON schema and retried with the errors on failure. Repeated lines are only sent once. | `content.py` |
| 4. Reference pitch | librosa pYIN on the vocal stem, stored as MIDI values per frame plus note bars. | `pitch.py` |
| 5. Line clips | One clip per line cut from the vocal stem with ffmpeg. | `clips.py` |
| 6. Difficulty | 1–10 overall with sub-scores for tempo (BPM, syllables/sec), range (semitones, big jumps), vocabulary rarity (wordfreq) and grammar (LLM). Raw measurements are stored in `difficulty.details` and shown on the song card. | `difficulty.py` |

Vocal separation is not built. `pipeline/separate.py` is a marked hook: if a folder has `mix.mp3` but no stems, the pipeline calls it, and it currently stops with a clear message. Implement it with Demucs later.

## Keys and environment variables

All variables live in one root `.env` (see `.env.example`), read by the server, the pipeline and Vite.

**Required**

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Signs login tokens. Use a long random string. |

**Optional (the app runs without them, with the stated limits)**

| Variable | Used for | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Translations, phonetics, glosses and grammar rating (pipeline); feedback bullets (server). Model set by `ANTHROPIC_MODEL`, default `claude-opus-5-5`. | Pipeline uses rough rule-based phonetics with no translations or glosses. Feedback bullets come from templates. |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | Pronunciation Assessment (`es-MX`, `hi-IN`) and optional cloud TTS | Falls back to Whisper, then to an estimate (below) |
| `OPENAI_API_KEY` | Whisper API: word-level alignment in the pipeline, and pronunciation fallback (transcribe, then compare to the lyrics) | Alignment estimates word times from syllables. Pronunciation falls back to an estimate. |

LRCLIB needs no key, only a `User-Agent` (`LRCLIB_USER_AGENT`).

With neither Azure nor OpenAI configured, the pronunciation score is an estimate: it only measures whether you were singing during each line, not how you pronounced it. The results page says so. For a no-key local option, install `pipeline/requirements-optional.txt` (faster-whisper) and set `ALIGNER=local` and `PRONUNCIATION_PROVIDER=local`.

The LLM is Anthropic only in this version. The content step also asks the API to reroute to a fallback model if the primary declines a request; set `ANTHROPIC_FALLBACKS=0` to turn that off.

## Practising a song

- **Listen first** plays the original (singer and music) with the lyrics and pitch lane moving in sync. Nothing is recorded and the microphone is not opened. Pause to click a line and study it.
- **Start singing** records you, starting from the beginning of the song or of the section you chose (or from wherever you moved the slider).
- **Skipping around.** Drag the slider, use the 10-second buttons, or press **Next line** to jump over an instrumental break. This works while listening and while singing. When a line is open in the side panel, **Jump to this line** moves there.
- **Practise a section.** Choose a "from" and "to" line. Listening and singing then start two seconds before the first line and stop after the last one; a take ends and is graded when it reaches the end of the section.
- **Guide vocals** decides whether you hear the original singer while you sing. Off gives you the backing track only; on makes it easier to follow along. You can switch it during a take, and the choice is remembered. Wear headphones so the microphone does not pick the singer up.

## How scoring works

- **Recording.** The browser records the mic as PCM laid out on the song's timeline (pausing pauses capture), downsamples to 16 kHz mono WAV, and uploads it with the live pitch track when you press End or the song finishes.
- **Pitch and timing** (`server/src/scoring/pitch.js`). Your pitch is tracked live with `pitchy`. The server finds the single key shift (mod 12) that best explains your whole take, so singing in another octave or key is fine, removes a constant device lag, then gives each reference frame credit if you sang the right pitch class within ±200 ms (full credit within 1 semitone, none beyond 3). Lines are scored separately and averaged.
- **Only what you sang counts** (`server/src/scoring/coverage.js`). The browser reports which parts of the song it recorded. A line is graded if at least half of it was recorded; lines you never reached, because you ended early, skipped ahead or practised a section, are marked "Not sung" and left out of both scores. A line you were recorded on but stayed silent for still scores zero.
- **Pronunciation** (`server/src/scoring/pronunciation.js`). Each line is sliced out of the recording by its timestamps and scored with Azure, or the whole take is transcribed with Whisper and compared with the lyrics.
- **Feedback** (`server/src/scoring/feedback.js`). Per-line results go to Claude for 2–3 "went well" and 2–3 "improve" bullets that name real lines and words.

## Tests

```bash
npm test
```

```bash
.venv/bin/python -m unittest discover pipeline/tests
```

## Libraries

**Server**

| Library | Why |
|---|---|
| express | HTTP API and static `/media` |
| mongoose | MongoDB models |
| jsonwebtoken, bcryptjs | JWT sessions and password hashing |
| multer | Receives the recording upload |
| cors, dotenv | Dev CORS and `.env` loading |
| @anthropic-ai/sdk | Feedback bullets (needs `ANTHROPIC_API_KEY`) |

Azure Speech and the Whisper API are called with plain `fetch`, so there is no SDK for them.

**Client**

| Library | Why |
|---|---|
| react, react-dom, react-router-dom | UI and routing |
| vite, @vitejs/plugin-react | Dev server and build |
| pitchy | Live pitch detection from the microphone |

Playback, mic capture (AudioWorklet) and WAV encoding use the Web Audio API directly. "Hear it spoken" uses the browser's `speechSynthesis`; set `VITE_TTS_PROVIDER=azure` to use Azure TTS through `GET /api/tts`.

**Pipeline** (`pipeline/requirements.txt`)

| Library | Why |
|---|---|
| librosa, numpy, soundfile | Audio loading, pYIN pitch, tempo, energy envelope |
| requests | LRCLIB and Whisper API calls |
| anthropic | LLM content and grammar rating (needs `ANTHROPIC_API_KEY`) |
| jsonschema | Validates the LLM's JSON |
| wordfreq | Word frequency lists for vocabulary rarity |
| pymongo | Writes the Song document |
| python-dotenv | Loads `.env` |
| faster-whisper (optional) | Local Whisper for alignment and pronunciation without a key |

`ffmpeg` (system tool) cuts the line clips and decodes MP3. Root dev dependency: `concurrently` runs the server and client together.

## Known limits

- Word alignment matches Whisper word timestamps to the lyrics rather than running true phoneme-level forced alignment (WhisperX). Words Whisper misses are interpolated between their neighbours.
- The pitch score absorbs a constant device lag, so it cannot tell "consistently 150 ms late" from audio latency. Per-line timing differences are still reported.
- Song audio and fetched lyrics are copyrighted, so `.gitignore` keeps everything in `songs/<slug>/` except `meta.json` out of the repo.
- Out of scope for now: finding or uploading songs in the UI, vocal separation, sheet music, mobile layout polish.
