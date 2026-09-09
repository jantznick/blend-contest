/**
 * LED note targets for Mix Ultra (same ch/note as djay `output` entries).
 * Channels match our input map (djay nibble + 1).
 *
 * ## Pad-mode vs pad LEDs
 *
 * Performance pads share one physical LED ring per deck. djay uses different
 * MIDI note bases per pad mode (see `PAD_BASES` in mixUltraMap.ts: 0 = HOT CUE,
 * 8 = SHIFT-clear, 16/32/80/112/120 = LOOP, FX, Sampler, Neural, etc.).
 *
 * **What we mirror today (`ledsFromSession`):**
 * - Transport: play / cue / sync / phones on deck channels 2/3.
 * - Hot-cue pads only: ch 7 (deck 1) / ch 8 (deck 2), notes 0–7 lit when a
 *   cue is stored on that pad index. Shift-clear (notes 8–15) does not turn
 *   LEDs on in our app — djay owns that flash pattern.
 *
 * **What we do not drive:**
 * - Mode-button LEDs (HOT CUE / LOOP / FX / NEURAL solid vs flashing). No
 *   output bindings yet; MixUltraDeck shows mode visually only.
 * - LOOP/FX/Neural pad colors while those modes are active. If the controller
 *   is in LOOP/FX, pad note-ons use non–hot-cue bases (`isNonHotCuePad`) and
 *   our cue LEDs may disagree with djay until HOT CUE mode is selected.
 *
 * **Lab UX:** Free play warns when non–hot-cue pads fire. For graded labs,
 * assume HOT CUE mode unless the drill says otherwise.
 */
import { setLed } from "./out";

export type LedId =
  | "deck1.play"
  | "deck1.cue"
  | "deck1.sync"
  | "deck1.headphone"
  | "deck2.play"
  | "deck2.cue"
  | "deck2.sync"
  | "deck2.headphone"
  | `deck1.pad.${number}`
  | `deck2.pad.${number}`;

type LedTarget = { channel: number; note: number };

const DECK_LEDS: Record<
  "deck1.play" | "deck1.cue" | "deck1.sync" | "deck1.headphone" | "deck2.play" | "deck2.cue" | "deck2.sync" | "deck2.headphone",
  LedTarget
> = {
  "deck1.play": { channel: 2, note: 7 },
  "deck1.cue": { channel: 2, note: 6 },
  "deck1.sync": { channel: 2, note: 5 },
  "deck1.headphone": { channel: 2, note: 12 },
  "deck2.play": { channel: 3, note: 7 },
  "deck2.cue": { channel: 3, note: 6 },
  "deck2.sync": { channel: 3, note: 5 },
  "deck2.headphone": { channel: 3, note: 12 },
};

/** Hot-cue pad LEDs: djay ch 6/7 → our 7/8, notes 0–7. */
function padLed(deck: 1 | 2, pad: number): LedTarget {
  return { channel: deck === 1 ? 7 : 8, note: pad };
}

const lastSent = new Map<string, boolean>();

export function ledTarget(id: LedId): LedTarget | null {
  if (id in DECK_LEDS) return DECK_LEDS[id as keyof typeof DECK_LEDS];
  const m = /^deck([12])\.pad\.(\d+)$/.exec(id);
  if (!m) return null;
  const deck = Number(m[1]) as 1 | 2;
  const pad = Number(m[2]);
  if (pad < 0 || pad > 7) return null;
  return padLed(deck, pad);
}

/** Diff and send only changed LEDs. */
export function applyLedState(desired: Partial<Record<LedId, boolean>>) {
  for (const [id, on] of Object.entries(desired) as [LedId, boolean][]) {
    if (on == null) continue;
    const prev = lastSent.get(id);
    if (prev === on) continue;
    const target = ledTarget(id);
    if (!target) continue;
    if (setLed(target.channel, target.note, on)) {
      lastSent.set(id, on);
    }
  }
}

export function clearLedCache() {
  lastSent.clear();
}

/** Force-send regardless of cache (for /labs/midi LED tests). */
export function sendLed(id: LedId, on: boolean): boolean {
  const target = ledTarget(id);
  if (!target) return false;
  const ok = setLed(target.channel, target.note, on);
  if (ok) lastSent.set(id, on);
  return ok;
}

export function ledTestPlayDeck1(): boolean {
  clearLedCache();
  return sendLed("deck1.play", true);
}

export function ledTestPads(): boolean {
  clearLedCache();
  let any = false;
  for (let i = 0; i < 8; i++) {
    if (sendLed(`deck1.pad.${i}` as LedId, true)) any = true;
    if (sendLed(`deck2.pad.${i}` as LedId, true)) any = true;
  }
  return any;
}

export function ledTestAllOff(): boolean {
  clearLedCache();
  const ids: LedId[] = [
    "deck1.play",
    "deck1.cue",
    "deck1.sync",
    "deck1.headphone",
    "deck2.play",
    "deck2.cue",
    "deck2.sync",
    "deck2.headphone",
  ];
  let any = false;
  for (const id of ids) {
    if (sendLed(id, false)) any = true;
  }
  for (let i = 0; i < 8; i++) {
    if (sendLed(`deck1.pad.${i}` as LedId, false)) any = true;
    if (sendLed(`deck2.pad.${i}` as LedId, false)) any = true;
  }
  return any;
}

/** Build desired LED map from session transport + hot cues (+ optional drill highlight). */
export function ledsFromSession(opts: {
  playing1: boolean;
  playing2: boolean;
  cues1: (number | null)[];
  cues2: (number | null)[];
  highlight?: string | null;
}): Partial<Record<LedId, boolean>> {
  const out: Partial<Record<LedId, boolean>> = {
    "deck1.play": opts.playing1,
    "deck2.play": opts.playing2,
    "deck1.cue": false,
    "deck2.cue": false,
    "deck1.sync": false,
    "deck2.sync": false,
    "deck1.headphone": false,
    "deck2.headphone": false,
  };
  for (let i = 0; i < 8; i++) {
    out[`deck1.pad.${i}` as LedId] = opts.cues1[i] != null;
    out[`deck2.pad.${i}` as LedId] = opts.cues2[i] != null;
  }
  if (opts.highlight && opts.highlight in out) {
    out[opts.highlight as LedId] = true;
  }
  return out;
}
