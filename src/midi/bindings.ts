export type ControlId =
  | "deck1.play"
  | "deck1.cue"
  | "deck1.filter"
  | "deck1.shift"
  | "deck2.play"
  | "deck2.cue"
  | "deck2.filter";

export type ControlBinding = {
  kind: "note" | "cc";
  channel: number;
  number: number;
};

export function bindingMatches(
  binding: ControlBinding,
  msg: { kind: string; channel: number | null; number: number | null },
): boolean {
  if (msg.channel !== binding.channel || msg.number !== binding.number) return false;
  if (binding.kind === "note") return msg.kind === "noteon";
  if (binding.kind === "cc") return msg.kind === "cc";
  return false;
}
