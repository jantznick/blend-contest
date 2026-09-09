/**
 * Derived from djay Pro Mix Ultra mapping.
 * djay midiChannel = status nibble; we store channel as nibble + 1.
 */
import type { ControlBinding } from "./bindings";
import { bindingMatches } from "./bindings";
import type { ParsedMidi } from "./parse";

export type MixUltraControl =
  | "deck1.play"
  | "deck1.cue"
  | "deck1.filter"
  | "deck1.low"
  | "deck1.mid"
  | "deck1.high"
  | "deck1.volume"
  | "deck1.sync"
  | "deck1.headphone"
  | "deck1.jog"
  | "deck1.jogTouch"
  | "deck1.pitch"
  | "deck2.play"
  | "deck2.cue"
  | "deck2.filter"
  | "deck2.low"
  | "deck2.mid"
  | "deck2.high"
  | "deck2.volume"
  | "deck2.sync"
  | "deck2.headphone"
  | "deck2.jog"
  | "deck2.jogTouch"
  | "deck2.pitch"
  | "crossfader"
  | "master";

function ch(djayChannel: number): number {
  return djayChannel + 1;
}

function note(djayChannel: number, number: number): ControlBinding {
  return { kind: "note", channel: ch(djayChannel), number };
}

function cc(djayChannel: number, number: number): ControlBinding {
  return { kind: "cc", channel: ch(djayChannel), number };
}

export const MIX_ULTRA_MAP: Record<MixUltraControl, ControlBinding> = {
  "deck1.play": note(1, 7),
  "deck1.cue": note(1, 6),
  "deck1.filter": cc(1, 1),
  "deck1.low": cc(1, 2),
  "deck1.mid": cc(1, 3),
  "deck1.high": cc(1, 4),
  "deck1.volume": cc(1, 0),
  "deck1.sync": note(1, 5),
  "deck1.headphone": note(1, 12),
  "deck1.jog": cc(1, 10),
  "deck1.jogTouch": note(1, 8),
  "deck1.pitch": cc(1, 8),

  "deck2.play": note(2, 7),
  "deck2.cue": note(2, 6),
  "deck2.filter": cc(2, 1),
  "deck2.low": cc(2, 2),
  "deck2.mid": cc(2, 3),
  "deck2.high": cc(2, 4),
  "deck2.volume": cc(2, 0),
  "deck2.sync": note(2, 5),
  "deck2.headphone": note(2, 12),
  "deck2.jog": cc(2, 10),
  "deck2.jogTouch": note(2, 8),
  "deck2.pitch": cc(2, 8),

  crossfader: cc(0, 0),
  master: cc(0, 3),
};

export const MIX_ULTRA_CONTROLS = Object.keys(MIX_ULTRA_MAP) as MixUltraControl[];

/** Performance pads: djay ch 6/7 → our 7/8. Physical pad = note offset within mode block. */
const PAD_BASES = [0, 8, 16, 32, 80, 112, 120];

export type PadHit = {
  deck: 1 | 2;
  pad: number; // 0–7
  /** shift-clear style (notes 8–15 in hot-cue mode) */
  clear: boolean;
};

function padDeck(msg: ParsedMidi): 1 | 2 | null {
  if (msg.channel == null) return null;
  if (msg.channel === 7) return 1;
  if (msg.channel === 8) return 2;
  return null;
}

/** Hot-cue pads only (notes 0–7 set/jump, 8–15 SHIFT clear). LOOP/FX/etc. use other bases. */
export function identifyHotCuePad(msg: ParsedMidi): PadHit | null {
  if (msg.kind !== "noteon" && msg.kind !== "noteoff") return null;
  if (msg.number == null) return null;
  const deck = padDeck(msg);
  if (!deck) return null;
  const n = msg.number;
  if (n >= 0 && n < 8) return { deck, pad: n, clear: false };
  if (n >= 8 && n < 16) return { deck, pad: n - 8, clear: true };
  return null;
}

/** True when pads fire but not in HOT CUE note range (e.g. LOOP mode). */
export function isNonHotCuePad(msg: ParsedMidi): boolean {
  return identifyPad(msg) != null && identifyHotCuePad(msg) == null;
}

export function identifyPad(msg: ParsedMidi): PadHit | null {
  if (msg.kind !== "noteon" && msg.kind !== "noteoff") return null;
  if (msg.number == null) return null;
  const deck = padDeck(msg);
  if (!deck) return null;
  const n = msg.number;
  for (const base of PAD_BASES) {
    if (n >= base && n < base + 8) {
      return { deck, pad: n - base, clear: base === 8 };
    }
  }
  return null;
}

export function identifyMixUltra(msg: ParsedMidi): MixUltraControl | null {
  for (const id of MIX_ULTRA_CONTROLS) {
    const b = MIX_ULTRA_MAP[id];
    if (b.kind === "note" && (msg.kind === "noteon" || msg.kind === "noteoff")) {
      if (msg.channel === b.channel && msg.number === b.number) return id;
    }
    if (b.kind === "cc" && bindingMatches(b, msg)) return id;
  }
  return null;
}

export function identifyMixUltraNote(
  channel: number,
  number: number,
): MixUltraControl | null {
  for (const id of MIX_ULTRA_CONTROLS) {
    const b = MIX_ULTRA_MAP[id];
    if (b.kind === "note" && b.channel === channel && b.number === number) return id;
  }
  return null;
}
