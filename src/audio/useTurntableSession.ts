import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { identifyMixUltra } from "../midi/mixUltraMap";
import type { LiveDeckValues, PadCueEvent } from "../midi/useLiveController";
import { useMidiMessages } from "../midi/useMidiBus";
import { getTrackCatalog, subscribeCatalog, type TrackId } from "./tracks";
import {
  applyLiveMix,
  createTurntable,
  cueStopDeck,
  disposeTurntable,
  ensureAudio,
  getDeckDuration,
  getDeckPeaks,
  getDeckPlayhead,
  getHotCues,
  handleJog,
  handlePad,
  loadTrack,
  setDeckPlaying,
  type TurntableEngine,
} from "./turntable";

function useCatalog() {
  return useSyncExternalStore(subscribeCatalog, getTrackCatalog, getTrackCatalog);
}

export function useTurntableSession(opts: {
  values: LiveDeckValues;
  midiEnabled: boolean;
  transportFromMidi?: boolean;
  /** Silence practice-bed output (e.g. Free Play with a Tidal song loaded). */
  muteBed1?: boolean;
  muteBed2?: boolean;
  /** When a deck has Tidal loaded, route PLAY/CUE to these handlers instead of the practice bed. */
  tidalTransport?: {
    hasTidal: (deck: 1 | 2) => boolean;
    playTidal: (deck: 1 | 2) => void;
    stopTidal: (deck: 1 | 2) => void;
    isTidalPlaying: (deck: 1 | 2) => boolean;
  };
}) {
  const engineRef = useRef<TurntableEngine | null>(null);
  const [booted, setBooted] = useState(false);
  const [playing1, setPlaying1] = useState(false);
  const [playing2, setPlaying2] = useState(false);
  const [track1, setTrack1] = useState<TrackId>("house");
  const [track2, setTrack2] = useState<TrackId>("deep");
  const [cues1, setCues1] = useState<(number | null)[]>(() => Array(8).fill(null));
  const [cues2, setCues2] = useState<(number | null)[]>(() => Array(8).fill(null));
  const [playhead1, setPlayhead1] = useState(0);
  const [playhead2, setPlayhead2] = useState(0);
  const [duration1, setDuration1] = useState(1);
  const [duration2, setDuration2] = useState(1);
  const [peaks1, setPeaks1] = useState<Float32Array>(() => new Float32Array(0));
  const [peaks2, setPeaks2] = useState<Float32Array>(() => new Float32Array(0));
  const [error, setError] = useState<string | null>(null);
  const valuesRef = useRef(opts.values);
  valuesRef.current = opts.values;
  const muteRef = useRef({ muteBed1: !!opts.muteBed1, muteBed2: !!opts.muteBed2 });
  muteRef.current = { muteBed1: !!opts.muteBed1, muteBed2: !!opts.muteBed2 };
  const tidalRef = useRef(opts.tidalTransport);
  tidalRef.current = opts.tidalTransport;
  const tracks = useCatalog();

  useEffect(() => {
    return () => {
      void disposeTurntable(engineRef.current);
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!engineRef.current || !booted) return;
    applyLiveMix(engineRef.current, opts.values, muteRef.current);
  }, [opts.values, opts.muteBed1, opts.muteBed2, booted]);

  const refreshWave = useCallback((eng: TurntableEngine) => {
    setPeaks1(getDeckPeaks(eng, 1));
    setPeaks2(getDeckPeaks(eng, 2));
    setDuration1(getDeckDuration(eng, 1));
    setDuration2(getDeckDuration(eng, 2));
  }, []);

  useEffect(() => {
    if (!booted) return;
    let raf = 0;
    const tick = () => {
      const eng = engineRef.current;
      if (eng) {
        setPlayhead1(getDeckPlayhead(eng, 1));
        setPlayhead2(getDeckPlayhead(eng, 2));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [booted]);

  const boot = useCallback(async () => {
    try {
      setError(null);
      if (!engineRef.current) {
        engineRef.current = await createTurntable();
      }
      await ensureAudio(engineRef.current);
      applyLiveMix(engineRef.current, valuesRef.current, muteRef.current);
      refreshWave(engineRef.current);
      setBooted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [refreshWave]);

  const playDeck = useCallback(
    async (deck: 1 | 2) => {
      if (!engineRef.current) await boot();
      const eng = engineRef.current;
      if (!eng) return;
      await ensureAudio(eng);
      setDeckPlaying(eng, deck, true);
      if (deck === 1) setPlaying1(true);
      else setPlaying2(true);
    },
    [boot],
  );

  const stopDeck = useCallback((deck: 1 | 2) => {
    if (!engineRef.current) return;
    cueStopDeck(engineRef.current, deck);
    if (deck === 1) setPlaying1(false);
    else setPlaying2(false);
  }, []);

  const setTrack = useCallback(
    async (deck: 1 | 2, id: TrackId) => {
      if (!engineRef.current) await boot();
      const eng = engineRef.current;
      if (!eng) return;
      await loadTrack(eng, deck, id);
      refreshWave(eng);
      if (deck === 1) {
        setTrack1(id);
        setCues1(getHotCues(eng, 1));
      } else {
        setTrack2(id);
        setCues2(getHotCues(eng, 2));
      }
    },
    [boot, refreshWave],
  );

  const onPad = useCallback(
    async (ev: PadCueEvent) => {
      if (!engineRef.current) await boot();
      const eng = engineRef.current;
      if (!eng) return;
      await ensureAudio(eng);
      const cues = handlePad(eng, ev.deck, ev.pad, ev.clear);
      if (ev.deck === 1) {
        setCues1(cues);
        setPlaying1(eng.deck1.playing);
      } else {
        setCues2(cues);
        setPlaying2(eng.deck2.playing);
      }
    },
    [boot],
  );

  const onJog = useCallback((deck: 1 | 2, delta: number) => {
    if (!engineRef.current) return;
    handleJog(engineRef.current, deck, delta);
  }, []);

  useMidiMessages(
    (msg) => {
      if (!opts.transportFromMidi || !opts.midiEnabled) return;
      const id = identifyMixUltra(msg);
      if (!id || msg.kind !== "noteon") return;
      const tidal = tidalRef.current;
      if (id === "deck1.play") {
        if (tidal?.hasTidal(1)) {
          if (tidal.isTidalPlaying(1)) tidal.stopTidal(1);
          else tidal.playTidal(1);
          return;
        }
        if (engineRef.current?.deck1.playing) stopDeck(1);
        else void playDeck(1);
      }
      if (id === "deck2.play") {
        if (tidal?.hasTidal(2)) {
          if (tidal.isTidalPlaying(2)) tidal.stopTidal(2);
          else tidal.playTidal(2);
          return;
        }
        if (engineRef.current?.deck2.playing) stopDeck(2);
        else void playDeck(2);
      }
      if (id === "deck1.cue") {
        if (tidal?.hasTidal(1)) {
          if (tidal.isTidalPlaying(1)) tidal.stopTidal(1);
          return;
        }
        if (engineRef.current?.deck1.playing) stopDeck(1);
      }
      if (id === "deck2.cue") {
        if (tidal?.hasTidal(2)) {
          if (tidal.isTidalPlaying(2)) tidal.stopTidal(2);
          return;
        }
        if (engineRef.current?.deck2.playing) stopDeck(2);
      }
    },
    opts.midiEnabled && opts.transportFromMidi !== false,
  );

  return {
    booted,
    error,
    boot,
    playDeck,
    stopDeck,
    setTrack,
    onPad,
    onJog,
    playing1,
    playing2,
    track1,
    track2,
    cues1,
    cues2,
    playhead1,
    playhead2,
    duration1,
    duration2,
    peaks1,
    peaks2,
    tracks,
  };
}
