# Blend Contest

Standalone two-deck mix grader for contest-style rounds.

## What it does (MVP)

1. Load two tracks (bundled synth beds and/or local file upload)
2. Arm browser audio
3. **Start transition** → mix with on-screen deck or hardware
4. **End & grade** → `judgeBasicTransition` scores control motion (EQ / filter / XF / tempo scaffold)

## Run

```bash
npm install
npm run dev
```

Optional: drop `house.mp3`, `deep.mp3`, `breaks.mp3`, `tech.mp3`, `blend-a.mp3`, `blend-b.mp3` into `public/tracks/`. Without files, the turntable uses synth beds.

Quit **djay** (or other apps) if the Mix Ultra won’t connect — many hosts take exclusive MIDI.

## Stack

- Vite + React 19 + TypeScript
- Web Audio dual deck (`src/audio/`)
- Mix Ultra MIDI map (`src/midi/`)
- Transition recipes + grader (`src/mix/timingFeedback.ts`)

No backend, Tidal, or auth in v1.

## Next (for a follow-up agent)

- Fixed contest song pairs + submit / leaderboard API
- Record master bus + optional audio-based grading
- Anti-cheat / session replay of control logs

