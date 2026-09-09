# Agent notes

## Why this repo exists

Contest product: grade a mix between **two songs**. This repo is the graded 2-deck player.

## Already scaffolded

- Dual-deck Web Audio + Mix Ultra MIDI + on-screen deck
- Transition Start / End grading (`judgeBasicTransition`)
- Hosted tracks via `public/tracks/` + local file upload with BPM field
- No streaming APIs, auth, or backend

## Suggested next tasks

<<<<<<< HEAD
1. Drop contest mp3/wav files into `public/tracks/` and list them in `src/audio/tracks.ts`
2. `npm install && npm run build` — fix any TS strict issues
3. Smoke-test in browser: Arm → Start → move XF/EQ → End & grade
4. Fixed contest rounds (admin-picked hosted pair) + score persistence
5. Optional: MediaRecorder on master bus for audio review

## Source reference

Upstream practice code: https://github.com/jantznick/hercules  
Especially: `src/audio/`, `src/midi/`, `src/mix/timingFeedback.ts`, `TransitionPracticeLab.tsx`
=======
1. `npm install && npm run build` — fix any TS strict issues
2. Smoke-test in browser: Arm → Start → move XF/EQ → End & grade
3. Add fixed contest rounds + score persistence
4. Optional: MediaRecorder on master bus for audio review
>>>>>>> origin/main
