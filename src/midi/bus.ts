import { parseMidiMessage, type ParsedMidi } from "./parse";

export type MidiBusStatus =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "ready"; inputCount: number; outputCount: number }
  | { status: "unsupported" }
  | { status: "denied"; message: string }
  | { status: "error"; message: string };

type Listener = (msg: ParsedMidi) => void;
type StatusListener = (s: MidiBusStatus) => void;

let access: MIDIAccess | null = null;
let busStatus: MidiBusStatus = { status: "idle" };
const messageListeners = new Set<Listener>();
const statusListeners = new Set<StatusListener>();

function setStatus(next: MidiBusStatus) {
  busStatus = next;
  for (const fn of statusListeners) fn(next);
}

function emit(msg: ParsedMidi) {
  for (const fn of messageListeners) fn(msg);
}

/** Software / pointer input — same listeners as physical MIDI. */
export function injectMidi(msg: ParsedMidi) {
  emit(msg);
}

function attachInputs(a: MIDIAccess) {
  for (const input of a.inputs.values()) {
    input.onmidimessage = (event: MIDIMessageEvent) => {
      const data = event.data;
      if (!data || data.length === 0) return;
      const parsed = parseMidiMessage(data);
      if (parsed) emit(parsed);
    };
  }
}

function refreshReady(a: MIDIAccess) {
  setStatus({
    status: "ready",
    inputCount: a.inputs.size,
    outputCount: a.outputs.size,
  });
}

export function getMidiStatus(): MidiBusStatus {
  return busStatus;
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

export async function connectMidiBus(): Promise<MidiBusStatus> {
  if (!hasWebMidi()) {
    setStatus({ status: "unsupported" });
    return busStatus;
  }
  if (access && busStatus.status === "ready") return busStatus;

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
