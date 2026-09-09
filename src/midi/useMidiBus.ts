import { useEffect, useState } from "react";
import {
  connectMidiBus,
  getMidiStatus,
  subscribeMidi,
  subscribeMidiStatus,
  type MidiBusStatus,
} from "./bus";
import type { ParsedMidi } from "./parse";

export function useMidiStatus(): MidiBusStatus {
  const [status, setStatus] = useState<MidiBusStatus>(getMidiStatus);
  useEffect(() => subscribeMidiStatus(setStatus), []);
  return status;
}

export function useMidiMessages(onMessage: (msg: ParsedMidi) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    return subscribeMidi(onMessage);
  }, [onMessage, enabled]);
}

export function useMidiConnect() {
  const status = useMidiStatus();
  return {
    status,
    connect: connectMidiBus,
    ready: status.status === "ready",
  };
}
