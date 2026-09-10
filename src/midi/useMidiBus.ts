import { useEffect, useRef, useState } from "react";
import {
  connectMidiBus,
  getMidiActivity,
  getMidiStatus,
  subscribeMidi,
  subscribeMidiActivity,
  subscribeMidiStatus,
  type MidiActivity,
  type MidiBusStatus,
} from "./bus";
import type { ParsedMidi } from "./parse";

export function useMidiStatus(): MidiBusStatus {
  const [status, setStatus] = useState<MidiBusStatus>(getMidiStatus);
  useEffect(() => subscribeMidiStatus(setStatus), []);
  return status;
}

export function useMidiActivity(): MidiActivity | null {
  const [activity, setActivity] = useState<MidiActivity | null>(getMidiActivity);
  useEffect(() => subscribeMidiActivity(setActivity), []);
  return activity;
}

/**
 * Stable subscription — keep the latest handler in a ref so React re-renders
 * (e.g. every CC tick) do not tear down and recreate the listener mid-stream.
 */
export function useMidiMessages(onMessage: (msg: ParsedMidi) => void, enabled = true) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;
    return subscribeMidi((msg) => onMessageRef.current(msg));
  }, [enabled]);
}

export function useMidiConnect() {
  const status = useMidiStatus();
  return {
    status,
    connect: connectMidiBus,
    ready: status.status === "ready",
  };
}
