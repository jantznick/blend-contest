import { parseMidiMessage, type ParsedMidi } from "./parse";

export type MidiPortInfo = { id: string; name: string };

export type MidiBusStatus =
  | { status: "idle" }
  | { status: "connecting" }
  | {
      status: "ready";
      inputCount: number;
      outputCount: number;
      inputs: MidiPortInfo[];
      outputs: MidiPortInfo[];
    }
  | { status: "unsupported" }
  | { status: "denied"; message: string }
  | { status: "error"; message: string };

/** Last physical or injected MIDI message summary (for troubleshooting). */
export type MidiActivity = {
  at: number;
  kind: string;
  channel: number | null;
  number: number | null;
  value: number;
  source: "hardware" | "inject";
};

type Listener = (msg: ParsedMidi) => void;
type StatusListener = (s: MidiBusStatus) => void;
type ActivityListener = (a: MidiActivity | null) => void;

let access: MIDIAccess | null = null;
let busStatus: MidiBusStatus = { status: "idle" };
let lastActivity: MidiActivity | null = null;
const messageListeners = new Set<Listener>();
const statusListeners = new Set<StatusListener>();
const activityListeners = new Set<ActivityListener>();

function setStatus(next: MidiBusStatus) {
  busStatus = next;
  for (const fn of statusListeners) fn(next);
}

function setActivity(next: MidiActivity) {
  lastActivity = next;
  for (const fn of activityListeners) fn(next);
}

function emit(msg: ParsedMidi, source: "hardware" | "inject") {
  setActivity({
    at: msg.at,
    kind: msg.kind,
    channel: msg.channel,
    number: msg.number,
    value: msg.value,
    source,
  });
  for (const fn of messageListeners) fn(msg);
}

/** Software / pointer input — same listeners as physical MIDI. */
export function injectMidi(msg: ParsedMidi) {
  emit(msg, "inject");
}

function portList(ports: MIDIInputMap | MIDIOutputMap): MidiPortInfo[] {
  const list: MidiPortInfo[] = [];
  for (const port of ports.values()) {
    list.push({ id: port.id, name: port.name?.trim() || port.id });
  }
  return list;
}

function attachInputs(a: MIDIAccess) {
  for (const input of a.inputs.values()) {
    input.onmidimessage = (event: MIDIMessageEvent) => {
      const data = event.data;
      if (!data || data.length === 0) return;
      const parsed = parseMidiMessage(data);
      if (parsed) emit(parsed, "hardware");
    };
  }
}

function refreshReady(a: MIDIAccess) {
  setStatus({
    status: "ready",
    inputCount: a.inputs.size,
    outputCount: a.outputs.size,
    inputs: portList(a.inputs),
    outputs: portList(a.outputs),
  });
}

export function getMidiStatus(): MidiBusStatus {
  return busStatus;
}

export function getMidiActivity(): MidiActivity | null {
  return lastActivity;
}

/** Active MIDIAccess after connect, or null. Used for MIDI out / LEDs. */
export function getMidiAccess(): MIDIAccess | null {
  return access;
}

export function hasWebMidi(): boolean {
  return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
}

export function subscribeMidi(fn: Listener): () => void {
  messageListeners.add(fn);
  return () => messageListeners.delete(fn);
}

export function subscribeMidiStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  fn(busStatus);
  return () => statusListeners.delete(fn);
}

export function subscribeMidiActivity(fn: ActivityListener): () => void {
  activityListeners.add(fn);
  fn(lastActivity);
  return () => activityListeners.delete(fn);
}

export async function connectMidiBus(opts?: { force?: boolean }): Promise<MidiBusStatus> {
  if (!hasWebMidi()) {
    setStatus({ status: "unsupported" });
    return busStatus;
  }
  if (!opts?.force && access && busStatus.status === "ready") return busStatus;
  if (opts?.force) {
    disconnectMidiBus();
  }

  setStatus({ status: "connecting" });
  try {
    const a = await navigator.requestMIDIAccess({ sysex: false });
    access = a;
    attachInputs(a);
    refreshReady(a);
    a.onstatechange = () => {
      if (!access) return;
      attachInputs(access);
      refreshReady(access);
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const denied =
      /denied|permission|security/i.test(message) ||
      (err instanceof DOMException && err.name === "NotAllowedError");
    setStatus(denied ? { status: "denied", message } : { status: "error", message });
  }
  return busStatus;
}

export function disconnectMidiBus() {
  if (access) {
    for (const input of access.inputs.values()) {
      input.onmidimessage = null;
    }
    access.onstatechange = null;
    access = null;
  }
  setStatus({ status: "idle" });
}
