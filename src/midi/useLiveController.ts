import { useCallback, useState } from "react";
import {
  identifyHotCuePad,
  identifyMixUltra,
  identifyPad,
  MIX_ULTRA_MAP,
  type MixUltraControl,
} from "./mixUltraMap";
import { useMidiConnect, useMidiMessages } from "./useMidiBus";

export type LiveDeckValues = Partial<Record<MixUltraControl, number>>;
export type LivePressed = Partial<Record<MixUltraControl, boolean>>;
export type PadBank = boolean[];

const emptyPads = (): PadBank => Array(8).fill(false);

const DEFAULT_CCS: LiveDeckValues = {
  "deck1.filter": 64,
  "deck1.low": 64,
  "deck1.mid": 64,
  "deck1.high": 64,
  "deck1.volume": 100,
  "deck1.pitch": 64,
  "deck2.filter": 64,
  "deck2.low": 64,
  "deck2.mid": 64,
  "deck2.high": 64,
  "deck2.volume": 100,
  "deck2.pitch": 64,
  crossfader: 64,
  master: 100,
};

export type PadCueEvent = {
  deck: 1 | 2;
  pad: number;
  clear: boolean;
};

/** Mirror Mix Ultra controls, pads, and jog. */
export function useLiveController(
  enabled = true,
  onPad?: (ev: PadCueEvent) => void,
  onJog?: (deck: 1 | 2, delta: number) => void,
) {
  const { ready, connect, status } = useMidiConnect();
  const [values, setValues] = useState<LiveDeckValues>(() => ({ ...DEFAULT_CCS }));
  const [pressed, setPressed] = useState<LivePressed>({});
  const [pads1, setPads1] = useState<PadBank>(emptyPads);
  const [pads2, setPads2] = useState<PadBank>(emptyPads);
  const [jogAngle1, setJogAngle1] = useState(0);
  const [jogAngle2, setJogAngle2] = useState(0);
  const [lastControl, setLastControl] = useState<string | null>(null);

  useMidiMessages(
    (msg) => {
      const pad = identifyPad(msg);
      if (pad) {
        setLastControl(`deck${pad.deck}.pad${pad.pad + 1}`);
        const setPads = pad.deck === 1 ? setPads1 : setPads2;
        if (msg.kind === "noteon") {
          setPads((prev) => {
            const next = [...prev];
            next[pad.pad] = true;
            return next;
          });
          // Only HOT CUE note range becomes cues — never silently map LOOP/FX pads.
          const hot = identifyHotCuePad(msg);
          if (hot) onPad?.({ deck: hot.deck, pad: hot.pad, clear: hot.clear });
        } else if (msg.kind === "noteoff") {
          setPads((prev) => {
            const next = [...prev];
            next[pad.pad] = false;
            return next;
          });
        }
        return;
      }

      const id = identifyMixUltra(msg);
      if (!id) return;
      const binding = MIX_ULTRA_MAP[id];
      setLastControl(id);

      if (binding.kind === "cc" && msg.kind === "cc") {
        if (id === "deck1.jog" || id === "deck2.jog") {
          // Relative jog: 64 = idle; below = one way, above = the other
          const delta = msg.value - 64;
          if (delta !== 0) {
            const deck = id === "deck1.jog" ? 1 : 2;
            if (deck === 1) setJogAngle1((a) => a + delta * 4);
            else setJogAngle2((a) => a + delta * 4);
            onJog?.(deck, delta);
          }
          return;
        }
        setValues((v) => ({ ...v, [id]: msg.value }));
        return;
      }

      if (binding.kind === "note") {
        if (msg.kind === "noteon") setPressed((p) => ({ ...p, [id]: true }));
        else if (msg.kind === "noteoff") setPressed((p) => ({ ...p, [id]: false }));
      }
    },
    enabled,
  );

  const resetVisuals = useCallback(() => {
    setValues({ ...DEFAULT_CCS });
    setPressed({});
    setPads1(emptyPads());
    setPads2(emptyPads());
    setJogAngle1(0);
    setJogAngle2(0);
    setLastControl(null);
  }, []);

  return {
    ready,
    connect,
    status,
    values,
    pressed,
    pads1,
    pads2,
    jogAngle1,
    jogAngle2,
    lastControl,
    resetVisuals,
    defaults: DEFAULT_CCS,
  };
}
