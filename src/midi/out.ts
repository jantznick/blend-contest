import { getMidiAccess } from "./bus";

/** Prefer the Mix Ultra output if present; else first available. */
export function pickMidiOutput(): MIDIOutput | null {
  const access = getMidiAccess();
  if (!access) return null;
  const outputs = [...access.outputs.values()];
  if (outputs.length === 0) return null;
  const prefer = outputs.find((o) =>
    /mix.?ultra|djcontrol/i.test(`${o.name ?? ""} ${o.manufacturer ?? ""}`),
  );
  return prefer ?? outputs[0] ?? null;
}

/** Web MIDI channel is 1–16; status nibble uses channel − 1. */
export function sendNote(channel: number, note: number, velocity: number) {
  const out = pickMidiOutput();
  if (!out) return false;
  const status = (velocity > 0 ? 0x90 : 0x80) | ((channel - 1) & 0x0f);
  out.send([status, note & 0x7f, velocity & 0x7f]);
  return true;
}

export function setLed(channel: number, note: number, on: boolean) {
  return sendNote(channel, note, on ? 127 : 0);
}
