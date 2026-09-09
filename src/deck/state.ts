/**
 * Lightweight deck session snapshot store.
 * Labs / free-play publish here; LED sync and mix feedback subscribe.
 */

import type { LiveDeckValues, LivePressed, PadBank } from "../midi/useLiveController";
import type { LedId } from "../midi/leds";
import type { TrackId } from "../audio/tracks";

export type DeckSnapshot = {
  playing1: boolean;
  playing2: boolean;
  track1: TrackId;
  track2: TrackId;
  cues1: (number | null)[];
  cues2: (number | null)[];
  values: LiveDeckValues;
  pressed: LivePressed;
  pads1: PadBank;
  pads2: PadBank;
  playhead1: number;
  playhead2: number;
  duration1: number;
  duration2: number;
  leds: Partial<Record<LedId, boolean>>;
  midiReady: boolean;
  audioReady: boolean;
  updatedAt: number;
};

const emptyPads = (): PadBank => Array(8).fill(false);
const emptyCues = () => Array(8).fill(null) as (number | null)[];

export const INITIAL_DECK_SNAPSHOT: DeckSnapshot = {
  playing1: false,
  playing2: false,
  track1: "house",
  track2: "deep",
  cues1: emptyCues(),
  cues2: emptyCues(),
  values: {},
  pressed: {},
  pads1: emptyPads(),
  pads2: emptyPads(),
  playhead1: 0,
  playhead2: 0,
  duration1: 1,
  duration2: 1,
  leds: {},
  midiReady: false,
  audioReady: false,
  updatedAt: 0,
};

let snapshot: DeckSnapshot = { ...INITIAL_DECK_SNAPSHOT };
const listeners = new Set<(s: DeckSnapshot) => void>();

export function getDeckSnapshot(): DeckSnapshot {
  return snapshot;
}

export function patchDeckSnapshot(partial: Partial<DeckSnapshot>) {
  snapshot = { ...snapshot, ...partial, updatedAt: performance.now() };
  for (const fn of listeners) fn(snapshot);
}

export function subscribeDeckSnapshot(fn: (s: DeckSnapshot) => void): () => void {
  listeners.add(fn);
  fn(snapshot);
  return () => listeners.delete(fn);
}
