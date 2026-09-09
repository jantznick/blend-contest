# Blend Contest

Standalone two-deck mix grader for contest-style rounds. Ported from the Mix Ultra practice core in [hercules](https://github.com/jantznick/hercules) — **not** an expansion of Key Mixer.

## What it does (MVP)

1. Load two hosted tracks (from `public/tracks/` and/or local file upload)
2. Arm browser audio (+ optional Hercules Mix Ultra via Web MIDI)
3. **Start transition** → mix with on-screen deck or hardware
4. **End & grade** → `judgeBasicTransition` scores control motion (EQ / filter / XF / tempo scaffold)

## Run

```bash
npm install
npm run dev
```

Drop audio into `public/tracks/` and register rows in `src/audio/tracks.ts`. Without files, the turntable uses synth beds as a fallback.

Quit **djay** (or other apps) if the Mix Ultra won’t connect — many hosts take exclusive MIDI.

## Stack

- Vite + React 19 + TypeScript
- Web Audio dual deck (`src/audio/`)
- Mix Ultra MIDI map (`src/midi/`)
- Transition recipes + grader (`src/mix/timingFeedback.ts`)

No backend or streaming integrations in v1 — audio is **hosted content** only.

## Next (for a follow-up agent)

- Fixed contest song pairs (hosted files) + submit / leaderboard API
- Record master bus + optional audio-based grading
- Trim unused CSS from Hercules `App.css` port
- Anti-cheat / session replay of control logs

## Provenance

Core engine and Mix Ultra UI were copied from Hercules, then stripped of tutorials, streaming free-play, Prisma, and curriculum routes. Contest shell lives in `src/components/ContestPage.tsx`.
