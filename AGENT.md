# Agent notes

## Why this repo exists

Contest product: grade a mix between **two songs**. Key Mixer stays harmonic planning; Hercules stays curriculum. This repo is the graded 2-deck player.

## Already scaffolded

- Dual-deck Web Audio + Mix Ultra MIDI + on-screen deck
- Transition Start / End grading (`judgeBasicTransition`)
- Local file upload with BPM field
- No Tidal / tutorials / Prisma

## Suggested next tasks

1. Follow [docs/plans/tidal-integration.md](docs/plans/tidal-integration.md) — Horizon A (search → load decks)
2. `npm install && npm run build` — fix any TS strict issues
3. Smoke-test in browser: Arm → Start → move XF/EQ → End & grade
4. Horizon B: admin daily Tidal pair + score persistence
5. Optional: MediaRecorder on master bus for audio review

## Source reference

Upstream practice code: https://github.com/jantznick/hercules  
Especially: `src/audio/`, `src/midi/`, `src/mix/timingFeedback.ts`, `TransitionPracticeLab.tsx`
