import { identifyMixUltra, identifyPad } from "./mixUltraMap";
import type { MidiActivity } from "./bus";

export function formatMidiActivity(activity: MidiActivity | null): string | null {
  if (!activity) return null;
  const ch = activity.channel != null ? `ch${activity.channel}` : "ch?";
  const num = activity.number != null ? `#${activity.number}` : "";
  return `${activity.kind} ${ch} ${num} = ${activity.value}`.replace(/\s+/g, " ").trim();
}

export function describeMappedControl(activity: MidiActivity | null): string | null {
  if (!activity) return null;
  const msg = {
    kind: activity.kind as "noteon" | "noteoff" | "cc" | "pitchbend" | "other",
    channel: activity.channel,
    number: activity.number,
    value: activity.value,
    raw: new Uint8Array(),
    at: activity.at,
  };
  const pad = identifyPad(msg);
  if (pad) return `deck${pad.deck}.pad${pad.pad + 1}`;
  return identifyMixUltra(msg);
}
