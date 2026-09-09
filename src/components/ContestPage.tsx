import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  getBundledTracks,
  registerUploadedTrack,
  trackById,
  type TrackId,
  type TrackInfo,
} from "../audio/tracks";
import { useTurntableSession } from "../audio/useTurntableSession";
import { usePublishDeckState, useTransitionMotionRecorder } from "../deck/hooks";
import { GENRE_OPTIONS, type GenreId } from "../genres";
import { GENRE_DECK_PAIRS } from "../mix/genrePresets";
import {
  judgeBasicTransition,
  pushPlayheadSample,
  TRANSITION_RECIPES,
  type PlayheadSample,
  type TransitionJudgment,
  type TransitionRecipeId,
} from "../mix/timingFeedback";
import { useLiveController, type PadCueEvent } from "../midi/useLiveController";
import { useHardwareArm } from "../context/HardwareArmContext";
import { DjBooth } from "./DjBooth";
import { HardwareGrade } from "./HardwareLabShell";
import { WaveformStrip } from "./WaveformStrip";

type SessionPhase = "idle" | "recording" | "graded";

function tipClass(verdict: string): string {
  if (verdict === "ok" || verdict === "aligned") return "ok";
  if (verdict === "incomplete" || verdict === "n/a") return "incomplete";
  if (verdict === "warn" || verdict === "offset" || verdict === "too-slow") return "too-slow";
  return "too-fast";
}

async function decodeFile(file: File): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
  } finally {
    void ctx.close();
  }
}

function DeckLoad({
  deck,
  tracks,
  value,
  locked,
  onSelect,
  onUploaded,
}: {
  deck: 1 | 2;
  tracks: TrackInfo[];
  value: TrackId;
  locked: boolean;
  onSelect: (id: TrackId) => void;
  onUploaded: (id: TrackId) => void;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [bpm, setBpm] = useState(126);
  const list = tracks.length ? tracks : getBundledTracks();

  const onFile = async (file: File | null) => {
    if (!file || locked) return;
    setBusy(true);
    try {
      const buffer = await decodeFile(file);
      const id = `upload-d${deck}-${Date.now()}`;
      registerUploadedTrack({
        id,
        title: file.name.replace(/\.[^.]+$/, "") || `Upload D${deck}`,
        bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : 126,
        objectUrl: URL.createObjectURL(file),
        buffer,
      });
      onUploaded(id);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="dj-load">
      <select
        value={value}
        disabled={locked || busy}
        aria-label={`Deck ${deck} track`}
        onChange={(e) => onSelect(e.target.value)}
      >
        {list.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title} · {t.bpm}
          </option>
        ))}
      </select>
      <input
        type="number"
        className="dj-load-bpm"
        min={60}
        max={200}
        value={bpm}
        disabled={locked || busy}
        aria-label={`Deck ${deck} upload BPM`}
        onChange={(e) => setBpm(Number(e.target.value))}
      />
      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept="audio/*"
        hidden
        disabled={locked || busy}
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />
      <button type="button" disabled={locked || busy} onClick={() => fileRef.current?.click()}>
        {busy ? "…" : "+"}
      </button>
    </div>
  );
}

/** Single-viewport turntable contest — hosted tracks on dual platters, no page scroll. */
export function ContestPage({
  initialTarget = "free",
}: {
  initialTarget?: TransitionRecipeId;
}) {
  const { arm: armMidi } = useHardwareArm();
  const padRef = useRef<(ev: PadCueEvent) => void>(() => {});
  const jogRef = useRef<(deck: 1 | 2, delta: number) => void>(() => {});
  const live = useLiveController(
    true,
    (ev) => padRef.current(ev),
    (deck, delta) => jogRef.current(deck, delta),
  );
  const tt = useTurntableSession({
    values: live.values,
    midiEnabled: true,
    transportFromMidi: true,
  });
  padRef.current = tt.onPad;
  jogRef.current = tt.onJog;

  const [genre, setGenre] = useState<GenreId>("any");
  const [target, setTarget] = useState<TransitionRecipeId>(initialTarget);
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [grade, setGrade] = useState<TransitionJudgment | null>(null);
  const [alignSamples, setAlignSamples] = useState<PlayheadSample[]>([]);

  const recording = phase === "recording";
  const locked = phase !== "idle";

  const pitch1 = live.values["deck1.pitch"] ?? 64;
  const pitch2 = live.values["deck2.pitch"] ?? 64;

  const { samples: motion, reset: resetMotion } = useTransitionMotionRecorder(
    {
      crossfader: live.values.crossfader,
      deck1Low: live.values["deck1.low"],
      deck2Low: live.values["deck2.low"],
      deck1Mid: live.values["deck1.mid"],
      deck2Mid: live.values["deck2.mid"],
      deck1High: live.values["deck1.high"],
      deck2High: live.values["deck2.high"],
      deck1Filter: live.values["deck1.filter"],
      deck2Filter: live.values["deck2.filter"],
      deck1Volume: live.values["deck1.volume"],
      deck2Volume: live.values["deck2.volume"],
      deck1Pitch: live.values["deck1.pitch"],
      deck2Pitch: live.values["deck2.pitch"],
    },
    recording,
  );

  useEffect(() => {
    if (!recording || !tt.booted || !tt.playing1 || !tt.playing2) return;
    const bpm1 = trackById(tt.track1).bpm;
    const bpm2 = trackById(tt.track2).bpm;
    setAlignSamples((prev) =>
      pushPlayheadSample(prev, {
        playhead1: tt.playhead1,
        playhead2: tt.playhead2,
        pitch1,
        pitch2,
        bpm1,
        bpm2,
      }),
    );
  }, [
    recording,
    tt.booted,
    tt.playing1,
    tt.playing2,
    tt.playhead1,
    tt.playhead2,
    tt.track1,
    tt.track2,
    pitch1,
    pitch2,
  ]);

  usePublishDeckState({
    playing1: tt.playing1,
    playing2: tt.playing2,
    track1: tt.track1,
    track2: tt.track2,
    cues1: tt.cues1,
    cues2: tt.cues2,
    values: live.values,
    pressed: live.pressed,
    pads1: live.pads1,
    pads2: live.pads2,
    playhead1: tt.playhead1,
    playhead2: tt.playhead2,
    midiReady: live.ready,
    audioReady: tt.booted,
    syncLeds: true,
  });

  const applyGenrePreset = useCallback(
    (g: GenreId) => {
      const pair = GENRE_DECK_PAIRS[g];
      void tt.setTrack(1, pair.deck1);
      void tt.setTrack(2, pair.deck2);
    },
    [tt.setTrack],
  );

  useEffect(() => {
    if (!tt.booted || locked) return;
    applyGenrePreset(genre);
  }, [genre, tt.booted, locked, applyGenrePreset]);

  const ensureAudio = async () => {
    try {
      await armMidi();
      await live.connect();
    } catch {
      /* MIDI optional */
    }
    await tt.boot();
  };

  const resetSession = useCallback(() => {
    setPhase("idle");
    setGrade(null);
    setAlignSamples([]);
    resetMotion();
  }, [resetMotion]);

  const resetAll = () => {
    tt.stopDeck(1);
    tt.stopDeck(2);
    resetSession();
  };

  const go = async () => {
    if (!tt.booted) await ensureAudio();
    resetMotion();
    setAlignSamples([]);
    setGrade(null);
    setPhase("recording");
    void tt.playDeck(1);
    void tt.playDeck(2);
  };

  const done = () => {
    const judgment = judgeBasicTransition(
      target,
      { ...motion, playheads: alignSamples },
      {
        bpm1: trackById(tt.track1).bpm,
        bpm2: trackById(tt.track2).bpm,
      },
    );
    setGrade(judgment);
    setPhase("graded");
  };

  const bed1 = trackById(tt.track1);
  const bed2 = trackById(tt.track2);

  return (
    <div className={`dj-app${recording ? " is-live" : ""}`}>
      <header className="dj-top">
        <div className="dj-brand-block">
          <h1 className="dj-brand">Blend Contest</h1>
          <p className="dj-tag">Mix two tracks. Get scored.</p>
        </div>

        <div className="dj-actions">
          {phase === "idle" && (
            <button type="button" className="dj-action primary" onClick={() => void go()}>
              Go
            </button>
          )}
          {phase === "recording" && (
            <button type="button" className="dj-action danger" onClick={done}>
              Done
            </button>
          )}
          {phase === "graded" && (
            <button type="button" className="dj-action primary" onClick={resetSession}>
              Again
            </button>
          )}
          <button type="button" className="dj-action" onClick={resetAll}>
            Reset
          </button>
        </div>

        <div className="dj-targets">
          <label className="dj-style">
            <span>Beds</span>
            <select
              value={genre}
              disabled={locked}
              onChange={(e) => setGenre(e.target.value as GenreId)}
            >
              {GENRE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div className="dj-modes" role="tablist" aria-label="Blend type">
            {TRANSITION_RECIPES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                className={target === r.id ? "active" : ""}
                aria-selected={target === r.id}
                disabled={locked}
                onClick={() => setTarget(r.id)}
              >
                {r.title}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="dj-waves">
        <WaveformStrip
          label="1"
          peaks={tt.peaks1}
          playhead={tt.playhead1}
          duration={tt.duration1}
          cues={tt.cues1}
          playing={tt.playing1}
        />
        <WaveformStrip
          label="2"
          peaks={tt.peaks2}
          playhead={tt.playhead2}
          duration={tt.duration2}
          cues={tt.cues2}
          playing={tt.playing2}
        />
      </div>

      {tt.error && <p className="dj-error">{tt.error}</p>}

      <div className="dj-stage">
        <DjBooth
          values={live.values}
          pressed={live.pressed}
          playing1={tt.playing1}
          playing2={tt.playing2}
          jogAngle1={live.jogAngle1}
          jogAngle2={live.jogAngle2}
          title1={bed1.title}
          title2={bed2.title}
          bpm1={bed1.bpm}
          bpm2={bed2.bpm}
          pads1={live.pads1}
          pads2={live.pads2}
          cues1={tt.cues1}
          cues2={tt.cues2}
          select1={
            <DeckLoad
              deck={1}
              tracks={tt.tracks}
              value={tt.track1}
              locked={locked}
              onSelect={(id) => {
                if (!locked) void tt.setTrack(1, id);
              }}
              onUploaded={(id) => {
                if (!locked) void tt.setTrack(1, id);
              }}
            />
          }
          select2={
            <DeckLoad
              deck={2}
              tracks={tt.tracks}
              value={tt.track2}
              locked={locked}
              onSelect={(id) => {
                if (!locked) void tt.setTrack(2, id);
              }}
              onUploaded={(id) => {
                if (!locked) void tt.setTrack(2, id);
              }}
            />
          }
        />
      </div>

      {grade && (
        <div className="dj-grade">
          <HardwareGrade pass={grade.passed}>
            <p>
              <strong>{grade.passed ? "Pass" : "Retry"}.</strong> {grade.summary}
            </p>
            {grade.dimensions.map((d) => (
              <p key={d.id} className={`mix-timing-tip ${tipClass(d.verdict)}`}>
                {d.label} ({d.score}): {d.tip}
              </p>
            ))}
            <p className="footer-note">
              Score is MIDI / on-screen control motion + tempo scaffold — not spectral audio analysis
              yet. Fixed hosted song pairs and leaderboards come next.
            </p>
          </HardwareGrade>
        </div>
      )}
    </div>
  );
}
