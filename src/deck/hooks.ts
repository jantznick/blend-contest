import { useEffect, useState, useSyncExternalStore } from "react";
import { applyLedState, clearLedCache, ledsFromSession, type LedId } from "../midi/leds";
import type { LiveDeckValues, LivePressed, PadBank } from "../midi/useLiveController";
import type { TrackId } from "../audio/tracks";
import {
  getDeckSnapshot,
  patchDeckSnapshot,
  subscribeDeckSnapshot,
  type DeckSnapshot,
} from "./state";

export function useDeckSnapshot(): DeckSnapshot {
  return useSyncExternalStore(subscribeDeckSnapshot, getDeckSnapshot, getDeckSnapshot);
}

type PublishArgs = {
  playing1: boolean;
  playing2: boolean;
  track1?: TrackId;
  track2?: TrackId;
  cues1: (number | null)[];
  cues2: (number | null)[];
  values?: LiveDeckValues;
  pressed?: LivePressed;
  pads1?: PadBank;
  pads2?: PadBank;
  playhead1?: number;
  playhead2?: number;
  duration1?: number;
  duration2?: number;
  midiReady?: boolean;
  audioReady?: boolean;
  syncLeds?: boolean;
  highlight?: string | null;
};

/** Push session fields into the global deck snapshot + optional MIDI LEDs. */
export function usePublishDeckState(args: PublishArgs) {
  const syncLeds = args.syncLeds !== false;
  const cues1Key = args.cues1.map((c) => c ?? "n").join(",");
  const cues2Key = args.cues2.map((c) => c ?? "n").join(",");

  useEffect(() => {
    const leds = ledsFromSession({
      playing1: args.playing1,
      playing2: args.playing2,
      cues1: args.cues1,
      cues2: args.cues2,
      highlight: args.highlight,
    });
    patchDeckSnapshot({
      playing1: args.playing1,
      playing2: args.playing2,
      track1: args.track1,
      track2: args.track2,
      cues1: args.cues1,
      cues2: args.cues2,
      values: args.values,
      pressed: args.pressed,
      pads1: args.pads1,
      pads2: args.pads2,
      playhead1: args.playhead1,
      playhead2: args.playhead2,
      duration1: args.duration1,
      duration2: args.duration2,
      midiReady: args.midiReady,
      audioReady: args.audioReady,
      leds,
    });
    if (syncLeds && args.midiReady) {
      applyLedState(leds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by cues*Key + primitives
  }, [
    args.playing1,
    args.playing2,
    args.track1,
    args.track2,
    cues1Key,
    cues2Key,
    args.playhead1,
    args.playhead2,
    args.midiReady,
    args.audioReady,
    args.highlight,
    syncLeds,
  ]);

  useEffect(() => {
    return () => {
      clearLedCache();
      const off: Partial<Record<LedId, boolean>> = {
        "deck1.play": false,
        "deck2.play": false,
        "deck1.cue": false,
        "deck2.cue": false,
      };
      for (let i = 0; i < 8; i++) {
        off[`deck1.pad.${i}` as LedId] = false;
        off[`deck2.pad.${i}` as LedId] = false;
      }
      applyLedState(off);
    };
  }, []);
}

/** Subscribe to CC motion for mix timing feedback (scaffolding). */
export function useMotionRecorder(value: number | undefined, enabled: boolean) {
  const [samples, setSamples] = useState<{ t: number; value: number }[]>([]);

  useEffect(() => {
    if (!enabled || value == null) return;
    setSamples((prev) => {
      const t = performance.now();
      const next = [...prev, { t, value }];
      const cutoff = t - 30_000;
      return next.filter((p) => p.t >= cutoff);
    });
  }, [value, enabled]);

  const reset = () => setSamples([]);
  return { samples, reset };
}

/**
 * Record two CC series (e.g. LOW + crossfader) for judgeBlendSession.
 * Resets both buffers together.
 */
export function useBlendMotionRecorder(
  low: number | undefined,
  crossfader: number | undefined,
  enabled: boolean,
) {
  const lowRec = useMotionRecorder(low, enabled);
  const xfRec = useMotionRecorder(crossfader, enabled);

  const reset = () => {
    lowRec.reset();
    xfRec.reset();
  };

  return {
    samples: { low: lowRec.samples, crossfader: xfRec.samples },
    reset,
  };
}

type TransitionCcBundle = {
  crossfader: number | undefined;
  deck1Low: number | undefined;
  deck2Low: number | undefined;
  deck1Mid: number | undefined;
  deck2Mid: number | undefined;
  deck1High: number | undefined;
  deck2High: number | undefined;
  deck1Filter: number | undefined;
  deck2Filter: number | undefined;
  deck1Volume: number | undefined;
  deck2Volume: number | undefined;
  deck1Pitch: number | undefined;
  deck2Pitch: number | undefined;
};

/** Record the CC set used by judgeBasicTransition. */
export function useTransitionMotionRecorder(ccs: TransitionCcBundle, enabled: boolean) {
  const crossfader = useMotionRecorder(ccs.crossfader, enabled);
  const deck1Low = useMotionRecorder(ccs.deck1Low, enabled);
  const deck2Low = useMotionRecorder(ccs.deck2Low, enabled);
  const deck1Mid = useMotionRecorder(ccs.deck1Mid, enabled);
  const deck2Mid = useMotionRecorder(ccs.deck2Mid, enabled);
  const deck1High = useMotionRecorder(ccs.deck1High, enabled);
  const deck2High = useMotionRecorder(ccs.deck2High, enabled);
  const deck1Filter = useMotionRecorder(ccs.deck1Filter, enabled);
  const deck2Filter = useMotionRecorder(ccs.deck2Filter, enabled);
  const deck1Volume = useMotionRecorder(ccs.deck1Volume, enabled);
  const deck2Volume = useMotionRecorder(ccs.deck2Volume, enabled);
  const deck1Pitch = useMotionRecorder(ccs.deck1Pitch, enabled);
  const deck2Pitch = useMotionRecorder(ccs.deck2Pitch, enabled);

  const reset = () => {
    crossfader.reset();
    deck1Low.reset();
    deck2Low.reset();
    deck1Mid.reset();
    deck2Mid.reset();
    deck1High.reset();
    deck2High.reset();
    deck1Filter.reset();
    deck2Filter.reset();
    deck1Volume.reset();
    deck2Volume.reset();
    deck1Pitch.reset();
    deck2Pitch.reset();
  };

  return {
    samples: {
      crossfader: crossfader.samples,
      deck1Low: deck1Low.samples,
      deck2Low: deck2Low.samples,
      deck1Mid: deck1Mid.samples,
      deck2Mid: deck2Mid.samples,
      deck1High: deck1High.samples,
      deck2High: deck2High.samples,
      deck1Filter: deck1Filter.samples,
      deck2Filter: deck2Filter.samples,
      deck1Volume: deck1Volume.samples,
      deck2Volume: deck2Volume.samples,
      deck1Pitch: deck1Pitch.samples,
      deck2Pitch: deck2Pitch.samples,
    },
    reset,
  };
}
