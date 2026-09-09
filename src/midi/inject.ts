/**
 * Software / pointer input that shares the same bus as physical MIDI.
 * Listeners (useLiveController, graded labs, turntable transport) see identical ParsedMidi.
 */
import { injectMidi } from "./bus";
import { MIX_ULTRA_MAP, type MixUltraControl } from "./mixUltraMap";
import type { ParsedMidi } from "./parse";

function clamp127(n: number): number {
  return Math.max(0, Math.min(127, Math.round(n)));
}

function buildRaw(status: number, d1: number, d2: number): Uint8Array {
  return new Uint8Array([status, d1, d2]);
}

function emit(msg: Omit<ParsedMidi, "raw" | "at"> & { raw?: Uint8Array }) {
  const raw =
    msg.raw ??
    buildRaw(
      msg.kind === "cc"
        ? 0xb0 | ((msg.channel ?? 1) - 1)
        : msg.kind === "noteoff"
          ? 0x80 | ((msg.channel ?? 1) - 1)
          : 0x90 | ((msg.channel ?? 1) - 1),
      msg.number ?? 0,
      msg.value,
    );
  injectMidi({ ...msg, raw, at: Date.now() });
}

/** Absolute CC write (knobs, faders, master). */
export function injectControlCc(id: MixUltraControl, value: number) {
  const b = MIX_ULTRA_MAP[id];
  if (b.kind !== "cc") return;
  emit({
    kind: "cc",
    channel: b.channel,
    number: b.number,
    value: clamp127(value),
  });
}

/** Note on/off for transport, headphones, jog touch, etc. */
export function injectControlNote(id: MixUltraControl, down: boolean, velocity = 127) {
  const b = MIX_ULTRA_MAP[id];
  if (b.kind !== "note") return;
  emit({
    kind: down ? "noteon" : "noteoff",
    channel: b.channel,
    number: b.number,
    value: down ? clamp127(velocity) : 0,
  });
}

/** Relative jog: 64 = idle; value = 64 + delta. */
export function injectJog(deck: 1 | 2, delta: number) {
  if (delta === 0) return;
  const id = deck === 1 ? "deck1.jog" : "deck2.jog";
  injectControlCc(id, 64 + Math.max(-63, Math.min(63, Math.round(delta))));
}

/**
 * Performance pad. modeBase 0 = HOT CUE (cues); other bases = LOOP/FX/etc.
 * clear uses hot-cue shift range (notes 8–15) when modeBase is 0.
 */
export function injectPad(
  deck: 1 | 2,
  pad: number,
  down: boolean,
  opts?: { clear?: boolean; modeBase?: number },
) {
  const channel = deck === 1 ? 7 : 8;
  const base = opts?.modeBase ?? 0;
  const number = base + pad + (opts?.clear && base === 0 ? 8 : 0);
  emit({
    kind: down ? "noteon" : "noteoff",
    channel,
    number,
    value: down ? 127 : 0,
  });
}

export const PAD_MODE_BASE: Record<string, number> = {
  "HOT CUE": 0,
  LOOP: 16,
  FX: 32,
  NEURAL: 80,
};
