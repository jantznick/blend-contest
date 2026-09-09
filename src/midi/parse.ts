export type MidiKind = "noteon" | "noteoff" | "cc" | "pitchbend" | "other";

export type ParsedMidi = {
  kind: MidiKind;
  channel: number | null;
  /** Note number or CC number */
  number: number | null;
  value: number;
  raw: Uint8Array;
  at: number;
};

export function parseMidiMessage(data: Uint8Array, at = Date.now()): ParsedMidi | null {
  if (data.length === 0) return null;
  const status = data[0]!;
  if (status === 0xf8) return null; // timing clock noise

  if (status >= 0xf0) {
    return { kind: "other", channel: null, number: null, value: 0, raw: data, at };
  }

  const channel = (status & 0x0f) + 1;
  const type = status & 0xf0;
  const d1 = data[1] ?? 0;
  const d2 = data[2] ?? 0;

  switch (type) {
    case 0x80:
      return { kind: "noteoff", channel, number: d1, value: d2, raw: data, at };
    case 0x90:
      if (d2 === 0) return { kind: "noteoff", channel, number: d1, value: 0, raw: data, at };
      return { kind: "noteon", channel, number: d1, value: d2, raw: data, at };
    case 0xb0:
      return { kind: "cc", channel, number: d1, value: d2, raw: data, at };
    case 0xe0:
      return {
        kind: "pitchbend",
        channel,
        number: null,
        value: (d2 << 7) | d1,
        raw: data,
        at,
      };
    default:
      return { kind: "other", channel, number: d1, value: d2, raw: data, at };
  }
}
