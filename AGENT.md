# Agent notes

## Why this repo exists

Contest product: grade a mix between **two songs**. This repo is the graded 2-deck player.

## Already scaffolded

- Dual-deck Web Audio + Mix Ultra MIDI + on-screen deck
- Transition Start / End grading (`judgeBasicTransition`)
- Local file upload with BPM field
- No Tidal / tutorials / Prisma

## Suggested next tasks

1. `npm install && npm run build` — fix any TS strict issues
2. Smoke-test in browser: Arm → Start → move XF/EQ → End & grade
3. Add fixed contest rounds + score persistence
4. Optional: MediaRecorder on master bus for audio review
