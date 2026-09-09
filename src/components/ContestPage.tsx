import { useCallback, useEffect, useRef, useState } from "react";
import { trackById } from "../audio/tracks";
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
import { HardwareGrade, HardwareLabShell } from "./HardwareLabShell";
import { MixUltraDeck } from "./MixUltraDeck";
import { TrackPickerBar } from "./TrackPickerBar";
import { WaveformStrip } from "./WaveformStrip";

type SessionPhase = "idle" | "recording" | "graded";

function tipClass(verdict: string): string {
  if (verdict === "ok" || verdict === "aligned") return "ok";
  if (verdict === "incomplete" || verdict === "n/a") return "incomplete";
  if (verdict === "warn" || verdict === "offset" || verdict === "too-slow") return "too-slow";
  return "too-fast";
}

/**
 * Contest round: two decks, Start → mix → End & grade (controller-motion score).
 * Ported from Hercules TransitionPracticeLab without tutorials / Tidal.
 */
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
    muteBed1: false,
    muteBed2: false,
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

  const arm = async () => {
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

  const startSession = async () => {
    if (!tt.booted) await arm();
    resetMotion();
    setAlignSamples([]);
    setGrade(null);
    setPhase("recording");
    void tt.playDeck(1);
    void tt.playDeck(2);
  };

  const endSession = () => {
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

  const targetMeta = TRANSITION_RECIPES.find((r) => r.id === target);
  const bed1 = trackById(tt.track1);
  const bed2 = trackById(tt.track2);

  return (
    <div className="contest-page">
      <header className="contest-header">
        <p className="contest-brand">Blend Contest</p>
        <h1>Mix two songs. Get graded.</h1>
        <p className="contest-lede">
          Load a pair, arm audio, hit Start, blend with Mix Ultra (or the on-screen deck), then End
          &amp; grade. Score reads your control motion — not yet full audio analysis.
        </p>
      </header>

      <HardwareLabShell
        audioArmed={tt.booted}
        onRestart={() => {
          tt.stopDeck(1);
          tt.stopDeck(2);
          resetSession();
        }}
        extraToolbar={
          <>
            <button
              type="button"
              className={tt.booted ? "active" : ""}
              disabled={locked}
              onClick={() => void arm()}
            >
              {tt.booted ? "Audio on" : "Arm audio"}
            </button>
            {phase === "idle" && (
              <button type="button" className="active" onClick={() => void startSession()}>
                Start transition
              </button>
            )}
            {phase === "recording" && (
              <button type="button" className="active transition-recording-btn" onClick={endSession}>
                End &amp; grade
              </button>
            )}
            {phase === "graded" && (
              <button type="button" onClick={resetSession}>
                Try again
              </button>
            )}
          </>
        }
      >
        {tt.error && <p className="midi-banner warn">{tt.error}</p>}
        {recording && (
          <p className="midi-banner transition-recording-banner">
            Recording — mix with the box (or on-screen deck). Hit <strong>End &amp; grade</strong>{" "}
            when Deck 2 owns the room.
          </p>
        )}

        <div className="transition-setup-row">
          <label className="genre-bar-label">
            <span>Style</span>
            <select
              value={genre}
              disabled={locked}
              onChange={(e) => setGenre(e.target.value as GenreId)}
              aria-label="Practice style — loads a default bed pair"
            >
              {GENRE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} ({opt.tag})
                </option>
              ))}
            </select>
          </label>
          <p className="genre-bar-hint">Style picks default demo beds — or choose / upload tracks below.</p>
        </div>

        <div className="lab-mode-toggle" role="tablist" aria-label="Transition target">
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
        <p className="lab-mode-note">{targetMeta?.blurb}</p>

        <TrackPickerBar
          tracks={tt.tracks}
          track1={tt.track1}
          track2={tt.track2}
          locked={locked}
          onSelect={(deck, id) => {
            if (!locked) void tt.setTrack(deck, id);
          }}
          onUploaded={(deck, id) => {
            if (!locked) void tt.setTrack(deck, id);
          }}
          hint={
            locked
              ? "Finish this attempt before changing tracks"
              : "Bundled beds or local uploads — set upload BPM before choosing a file"
          }
        />

        {tt.booted && (
          <div className="wave-stack">
            <WaveformStrip
              label={`Deck 1 · ${bed1.title}`}
              peaks={tt.peaks1}
              playhead={tt.playhead1}
              duration={tt.duration1}
              cues={tt.cues1}
              playing={tt.playing1}
            />
            <WaveformStrip
              label={`Deck 2 · ${bed2.title}`}
              peaks={tt.peaks2}
              playhead={tt.playhead2}
              duration={tt.duration2}
              cues={tt.cues2}
              playing={tt.playing2}
            />
          </div>
        )}

        <div className="hw-score-strip">
          <span>
            {phase === "recording" ? "Recording…" : phase === "graded" ? "Graded" : "Ready"}
          </span>
          <span>xf {live.values.crossfader ?? "—"}</span>
          <span>D2 low {live.values["deck2.low"] ?? "—"}</span>
          {grade && <span>score {grade.score}</span>}
        </div>

        <MixUltraDeck
          interactive
          values={live.values}
          pressed={live.pressed}
          playing1={tt.playing1}
          playing2={tt.playing2}
          pads1={live.pads1}
          pads2={live.pads2}
          cues1={tt.cues1}
          cues2={tt.cues2}
          jogAngle1={live.jogAngle1}
          jogAngle2={live.jogAngle2}
          trackLabel1={bed1.title}
          trackLabel2={bed2.title}
          prompt={
            phase === "recording"
              ? `Mixing: ${targetMeta?.title ?? "transition"} — EQ · Filter · XF · tempo`
              : phase === "graded"
                ? "Read the grade below — Try again for another pass"
                : `Pick a move, load decks, hit Start — then ${targetMeta?.title ?? "mix"}`
          }
          status={
            phase === "recording"
              ? "Leave SYNC off · grade reads your CC motion"
              : "Full Mix Ultra mirror — quit djay if using the same box"
          }
        />

        {grade && (
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
              yet. Contest leaderboards and fixed song pairs come next.
            </p>
          </HardwareGrade>
        )}
      </HardwareLabShell>
    </div>
  );
}
