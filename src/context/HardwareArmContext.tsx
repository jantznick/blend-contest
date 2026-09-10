import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMidiConnect } from "../midi/useMidiBus";
import type { MidiBusStatus } from "../midi/bus";

type HardwareArmContextValue = {
  status: MidiBusStatus;
  midiReady: boolean;
  /** True after MIDI connect attempt (audio is armed by the contest page session). */
  armed: boolean;
  arming: boolean;
  error: string | null;
  /** Connect MIDI when available; does not require a controller. */
  arm: () => Promise<void>;
};

const HardwareArmContext = createContext<HardwareArmContextValue | null>(null);

/** MIDI arming only — turntable audio is owned by useTurntableSession in ContestPage. */
export function HardwareArmProvider({ children }: { children: ReactNode }) {
  const { status, connect, ready: midiReady } = useMidiConnect();
  const [armed, setArmed] = useState(false);
  const [arming, setArming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const arm = useCallback(async () => {
    setArming(true);
    setError(null);
    try {
      try {
        await connect();
      } catch {
        /* MIDI optional — pointer deck still works */
      }
      setArmed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setArming(false);
    }
  }, [connect]);

  // Connect Web MIDI as soon as the app loads — don't wait for Go.
  useEffect(() => {
    void arm();
  }, [arm]);

  const value = useMemo(
    () => ({
      status,
      midiReady,
      armed,
      arming,
      error,
      arm,
    }),
    [status, midiReady, armed, arming, error, arm],
  );

  return <HardwareArmContext.Provider value={value}>{children}</HardwareArmContext.Provider>;
}

export function useHardwareArm() {
  const ctx = useContext(HardwareArmContext);
  if (!ctx) throw new Error("useHardwareArm must be used within HardwareArmProvider");
  return ctx;
}
