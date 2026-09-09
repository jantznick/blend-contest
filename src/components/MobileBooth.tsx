/**
 * Phone DJ layout (djay-style): persistent load + transport, slideable 1 / Mix / 2 stage.
 * Desktop DjBooth is unchanged — ContestPage swaps at a narrow breakpoint.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type UIEvent,
} from "react";
import { injectControlCc, injectControlNote, injectJog, injectPad, PAD_MODE_BASE } from "../midi/inject";
import type { MixUltraControl } from "../midi/mixUltraMap";
import type { LiveDeckValues, LivePressed } from "../midi/useLiveController";

const PAD_MODES = ["HOT CUE", "LOOP", "FX", "NEURAL"] as const;
const PAD_LABELS: Record<(typeof PAD_MODES)[number], string[]> = {
  "HOT CUE": ["1", "2", "3", "4", "5", "6", "7", "8"],
  LOOP: ["1/4", "1/2", "1", "2", "4", "8", "16", "32"],
  FX: ["LPF", "HPF", "-LO", "-MID", "-HI", "1/2", "GATE", "BRK"],
  NEURAL: ["KICK", "BASS", "MID", "HAT", "VOC", "INS", "MUTE", "RST"],
};

type FocusPane = "1" | "mix" | "2";
type Surface = "mixer" | "platters" | "pads";

function clamp127(n: number) {
  return Math.max(0, Math.min(127, Math.round(n)));
}

function pitchCcToRate(cc: number) {
  return 1 + ((cc - 64) / 64) * 0.08;
}

function formatEffectiveBpm(catalogBpm: number, pitchCc?: number | null) {
  const eff = catalogBpm * pitchCcToRate(pitchCc ?? 64);
  return Math.abs(eff - Math.round(eff)) < 0.05 ? String(Math.round(eff)) : eff.toFixed(1);
}

function formatPitchPct(pitchCc?: number | null) {
  const pct = (pitchCcToRate(pitchCc ?? 64) - 1) * 100;
  if (Math.abs(pct) < 0.05) return "0.0%";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function tapNote(id: MixUltraControl) {
  injectControlNote(id, true);
  window.setTimeout(() => injectControlNote(id, false), 80);
}

function Knob({
  id,
  label,
  value,
  size = "md",
}: {
  id: MixUltraControl;
  label: string;
  value?: number | null;
  size?: "sm" | "md" | "lg";
}) {
  const v = value == null ? 64 : value;
  const deg = -135 + (v / 127) * 270;
  const dragRef = useRef<{ y: number; start: number } | null>(null);

  return (
    <div
      className={`mb-knob mb-knob-${size}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={127}
      aria-valuenow={v}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { y: e.clientY, start: v };
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return;
        injectControlCc(id, clamp127(dragRef.current.start + (dragRef.current.y - e.clientY) * 0.9));
      }}
      onPointerUp={(e) => {
        dragRef.current = null;
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* */
        }
      }}
      onDoubleClick={() => injectControlCc(id, 64)}
    >
      <div className="mb-knob-body">
        <div className="mb-knob-cap" style={{ transform: `rotate(${deg}deg)` }}>
          <span className="mb-knob-mark" />
        </div>
      </div>
      <span className="mb-knob-label">{label}</span>
    </div>
  );
}

function Fader({
  id,
  value,
  vertical = true,
  label,
}: {
  id: MixUltraControl;
  value?: number | null;
  vertical?: boolean;
  label: string;
}) {
  const v = value == null ? 64 : value;
  const pct = (v / 127) * 100;
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (vertical) {
        injectControlCc(id, clamp127(((rect.bottom - clientY) / rect.height) * 127));
      } else {
        injectControlCc(id, clamp127(((clientX - rect.left) / rect.width) * 127));
      }
    },
    [id, vertical],
  );

  return (
    <div
      className={`mb-fader${vertical ? " vert" : " horiz"}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={127}
      aria-valuenow={v}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setFromClient(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 0) return;
        setFromClient(e.clientX, e.clientY);
      }}
    >
      <div className="mb-fader-rail" ref={trackRef}>
        <span
          className="mb-fader-cap"
          style={vertical ? { bottom: `${pct}%` } : { left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function JogWheel({
  deck,
  playing,
  touching,
  jogAngle,
  size = "lg",
}: {
  deck: 1 | 2;
  playing: boolean;
  touching: boolean;
  jogAngle: number;
  size?: "sm" | "lg";
}) {
  const lastX = useRef<number | null>(null);

  const down = (e: ReactPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    lastX.current = e.clientX;
    injectControlNote(`deck${deck}.jogTouch` as MixUltraControl, true);
  };
  const move = (e: ReactPointerEvent) => {
    if (lastX.current == null) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    const steps = Math.trunc(dx / 2);
    if (steps !== 0) injectJog(deck, steps);
  };
  const up = (e: ReactPointerEvent) => {
    lastX.current = null;
    injectControlNote(`deck${deck}.jogTouch` as MixUltraControl, false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
  };

  return (
    <div
      className={`mb-jog mb-jog-${size}${playing ? " on" : ""}${touching ? " touch" : ""}`}
      role="slider"
      aria-label={`Deck ${deck} jog`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="mb-jog-bezel">
        <div className="mb-jog-ring" style={{ transform: `rotate(${jogAngle}deg)` }}>
          <div className={`mb-jog-vinyl${playing && !touching ? " spinning" : ""}`}>
            <span className="mb-jog-grooves" aria-hidden />
            <span className="mb-jog-sticker">
              <span className="mb-jog-num">{deck}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TempoBar({
  deck,
  bpm,
  pitch,
}: {
  deck: 1 | 2;
  bpm: number;
  pitch?: number | null;
}) {
  const pitchId = `deck${deck}.pitch` as MixUltraControl;
  const v = pitch ?? 64;
  const nudge = (delta: number) => injectControlCc(pitchId, clamp127(v + delta));

  return (
    <div className="mb-tempo">
      <span className="mb-tempo-note" aria-hidden>
        ♪
      </span>
      <span className="mb-tempo-bpm">{formatEffectiveBpm(bpm, pitch)}</span>
      <Fader id={pitchId} value={pitch} vertical={false} label={`Deck ${deck} tempo`} />
      <span className="mb-tempo-pct">{formatPitchPct(pitch)}</span>
      <button type="button" className="mb-tempo-btn" aria-label="Slower" onClick={() => nudge(-2)}>
        −
      </button>
      <button type="button" className="mb-tempo-btn" aria-label="Faster" onClick={() => nudge(2)}>
        +
      </button>
    </div>
  );
}

function PadBank({
  deck,
  pads,
  cues,
  loopPad,
  neural,
}: {
  deck: 1 | 2;
  pads: boolean[];
  cues: (number | null)[];
  loopPad: number | null;
  neural: boolean[];
}) {
  const [padMode, setPadMode] = useState<(typeof PAD_MODES)[number]>("HOT CUE");
  const [shift, setShift] = useState(false);

  const padPointer = (pad: number, down: boolean, shiftKey: boolean) => {
    const modeBase = PAD_MODE_BASE[padMode] ?? 0;
    const clear = (shiftKey || shift) && modeBase === 0;
    injectPad(deck, pad, down, { clear, modeBase });
  };

  return (
    <div className="mb-pads-block">
      <div className="mb-pad-modes" role="group" aria-label={`Deck ${deck} pad mode`}>
        {PAD_MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={`mb-pad-mode${padMode === m ? " on" : ""}`}
            aria-pressed={padMode === m}
            onClick={() => setPadMode(m)}
          >
            {m}
          </button>
        ))}
        <button
          type="button"
          className={`mb-pad-mode mb-shift${shift ? " on" : ""}`}
          aria-pressed={shift}
          title="Latch SHIFT, then tap a HOT CUE pad to clear"
          onClick={() => setShift((s) => !s)}
        >
          SHIFT
        </button>
      </div>
      <div className="mb-pads" role="group" aria-label={`Deck ${deck} pads`}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const labels =
            shift && padMode === "HOT CUE" ? Array(8).fill("CLR") : PAD_LABELS[padMode];
          const armed =
            padMode === "HOT CUE"
              ? cues[i] != null
              : padMode === "LOOP"
                ? loopPad === i
                : padMode === "NEURAL"
                  ? !!neural[i]
                  : false;
          return (
            <button
              key={i}
              type="button"
              className={`mb-pad${pads[i] ? " hit" : ""}${armed ? " set" : ""}`}
              aria-label={`${padMode} pad ${labels[i]}`}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                padPointer(i, true, e.shiftKey);
              }}
              onPointerUp={(e) => padPointer(i, false, e.shiftKey)}
              onPointerCancel={(e) => padPointer(i, false, e.shiftKey)}
            >
              <span className="mb-pad-label">{labels[i]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MixerPane({ values }: { values: LiveDeckValues }) {
  return (
    <div className="mb-mixer">
      <div className="mb-mixer-filters">
        <Knob id="deck1.filter" label="FILTER" value={values["deck1.filter"]} size="lg" />
        <Knob id="deck2.filter" label="FILTER" value={values["deck2.filter"]} size="lg" />
      </div>
      <div className="mb-mixer-body">
        <Fader id="deck1.volume" value={values["deck1.volume"]} label="Deck 1 volume" />
        <div className="mb-eq-col">
          <Knob id="deck1.high" label="HI" value={values["deck1.high"]} size="sm" />
          <Knob id="deck1.mid" label="MID" value={values["deck1.mid"]} size="sm" />
          <Knob id="deck1.low" label="LOW" value={values["deck1.low"]} size="sm" />
        </div>
        <div className="mb-meters" aria-hidden>
          <span />
          <span />
        </div>
        <div className="mb-eq-col">
          <Knob id="deck2.high" label="HI" value={values["deck2.high"]} size="sm" />
          <Knob id="deck2.mid" label="MID" value={values["deck2.mid"]} size="sm" />
          <Knob id="deck2.low" label="LOW" value={values["deck2.low"]} size="sm" />
        </div>
        <Fader id="deck2.volume" value={values["deck2.volume"]} label="Deck 2 volume" />
      </div>
    </div>
  );
}

function DeckEqPane({ deck, values }: { deck: 1 | 2; values: LiveDeckValues }) {
  const p = (k: string) => `deck${deck}.${k}` as MixUltraControl;
  return (
    <div className="mb-deck-eq">
      <Knob id={p("filter")} label="FILTER" value={values[p("filter")]} size="lg" />
      <div className="mb-deck-eq-row">
        <Knob id={p("high")} label="HI" value={values[p("high")]} />
        <Knob id={p("mid")} label="MID" value={values[p("mid")]} />
        <Knob id={p("low")} label="LOW" value={values[p("low")]} />
        <Fader id={p("volume")} value={values[p("volume")]} label={`Deck ${deck} volume`} />
      </div>
    </div>
  );
}

type Props = {
  values: LiveDeckValues;
  pressed: LivePressed;
  playing1: boolean;
  playing2: boolean;
  jogAngle1: number;
  jogAngle2: number;
  title1: string;
  title2: string;
  bpm1: number;
  bpm2: number;
  pads1?: boolean[];
  pads2?: boolean[];
  cues1?: (number | null)[];
  cues2?: (number | null)[];
  loopPad1?: number | null;
  loopPad2?: number | null;
  neural1?: boolean[];
  neural2?: boolean[];
  select1: ReactNode;
  select2: ReactNode;
};

export function MobileBooth({
  values,
  pressed,
  playing1,
  playing2,
  jogAngle1,
  jogAngle2,
  title1,
  title2,
  bpm1,
  bpm2,
  pads1 = [],
  pads2 = [],
  cues1 = [],
  cues2 = [],
  loopPad1 = null,
  loopPad2 = null,
  neural1 = [],
  neural2 = [],
  select1,
  select2,
}: Props) {
  const [focus, setFocus] = useState<FocusPane>("mix");
  const [surface, setSurface] = useState<Surface>("platters");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const suppressScroll = useRef(false);

  const touching1 = !!pressed["deck1.jogTouch"];
  const touching2 = !!pressed["deck2.jogTouch"];

  const scrollToFocus = useCallback((pane: FocusPane, smooth = true) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const idx = pane === "1" ? 0 : pane === "mix" ? 1 : 2;
    const child = scroller.children[idx] as HTMLElement | undefined;
    if (!child) return;
    suppressScroll.current = true;
    child.scrollIntoView({
      behavior: smooth ? "smooth" : "instant",
      inline: "center",
      block: "nearest",
    });
    window.setTimeout(() => {
      suppressScroll.current = false;
    }, smooth ? 320 : 40);
  }, []);

  useEffect(() => {
    scrollToFocus("mix", false);
  }, [scrollToFocus]);

  const onFocusChange = (pane: FocusPane) => {
    setFocus(pane);
    scrollToFocus(pane, true);
  };

  const onStageScroll = (e: UIEvent<HTMLDivElement>) => {
    if (suppressScroll.current) return;
    const el = e.currentTarget;
    const w = el.clientWidth || 1;
    const idx = Math.round(el.scrollLeft / w);
    const next: FocusPane = idx <= 0 ? "1" : idx === 1 ? "mix" : "2";
    if (next !== focus) setFocus(next);
  };

  const paneContent = (pane: FocusPane) => {
    if (pane === "mix") {
      if (surface === "mixer") return <MixerPane values={values} />;
      if (surface === "pads") {
        return (
          <div className="mb-dual-pads">
            <PadBank deck={1} pads={pads1} cues={cues1} loopPad={loopPad1} neural={neural1} />
            <PadBank deck={2} pads={pads2} cues={cues2} loopPad={loopPad2} neural={neural2} />
          </div>
        );
      }
      return (
        <div className="mb-dual-jogs">
          <JogWheel
            deck={1}
            playing={playing1}
            touching={touching1}
            jogAngle={jogAngle1}
            size="sm"
          />
          <JogWheel
            deck={2}
            playing={playing2}
            touching={touching2}
            jogAngle={jogAngle2}
            size="sm"
          />
        </div>
      );
    }

    const deck: 1 | 2 = pane === "1" ? 1 : 2;
    const playing = deck === 1 ? playing1 : playing2;
    const touching = deck === 1 ? touching1 : touching2;
    const jogAngle = deck === 1 ? jogAngle1 : jogAngle2;
    const bpm = deck === 1 ? bpm1 : bpm2;
    const pitch = values[`deck${deck}.pitch`];
    const pads = deck === 1 ? pads1 : pads2;
    const cues = deck === 1 ? cues1 : cues2;
    const loopPad = deck === 1 ? loopPad1 : loopPad2;
    const neural = deck === 1 ? neural1 : neural2;

    return (
      <div className="mb-deck-focus">
        <TempoBar deck={deck} bpm={bpm} pitch={pitch} />
        {surface === "mixer" ? (
          <DeckEqPane deck={deck} values={values} />
        ) : surface === "pads" ? (
          <PadBank deck={deck} pads={pads} cues={cues} loopPad={loopPad} neural={neural} />
        ) : (
          <JogWheel
            deck={deck}
            playing={playing}
            touching={touching}
            jogAngle={jogAngle}
            size="lg"
          />
        )}
      </div>
    );
  };

  return (
    <div className="mb-shell" role="group" aria-label="Mobile DJ controller">
      <div className="mb-loads">
        <div className="mb-load">
          <span className="mb-load-deck">1</span>
          <strong className="mb-load-title" title={title1}>
            {title1}
          </strong>
          {select1}
        </div>
        <div className="mb-load-rec" aria-hidden />
        <div className="mb-load">
          <span className="mb-load-deck">2</span>
          <strong className="mb-load-title" title={title2}>
            {title2}
          </strong>
          {select2}
        </div>
      </div>

      <div className="mb-surfaces" role="tablist" aria-label="Center view">
        {(
          [
            ["mixer", "Mixer"],
            ["platters", "Platters"],
            ["pads", "Pads"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={surface === id}
            className={`mb-surface${surface === id ? " on" : ""}`}
            onClick={() => setSurface(id)}
          >
            <span className={`mb-surface-icon mb-surface-${id}`} aria-hidden />
            <span className="mb-sr">{label}</span>
          </button>
        ))}
      </div>

      <div
        className="mb-stage"
        ref={scrollerRef}
        onScroll={onStageScroll}
        aria-label="Deck stage — swipe between 1, Mix, and 2"
      >
        <section className="mb-pane" data-pane="1" aria-label="Deck 1">
          {paneContent("1")}
        </section>
        <section className="mb-pane" data-pane="mix" aria-label="Mix">
          {paneContent("mix")}
        </section>
        <section className="mb-pane" data-pane="2" aria-label="Deck 2">
          {paneContent("2")}
        </section>
      </div>

      <div className="mb-dock">
        <div className="mb-focus" role="tablist" aria-label="Focus deck">
          {(
            [
              ["1", "1"],
              ["mix", "Mix"],
              ["2", "2"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={focus === id}
              className={`mb-focus-tab${focus === id ? " on" : ""}`}
              onClick={() => onFocusChange(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-transport-row">
          <div className="mb-transport-deck">
            <button
              type="button"
              className={`mb-sync${pressed["deck1.sync"] ? " on" : ""}`}
              onClick={() => tapNote("deck1.sync")}
            >
              SYNC
            </button>
            <span className="mb-dock-bpm">{formatEffectiveBpm(bpm1, values["deck1.pitch"])}</span>
            <button type="button" className="mb-set" onClick={() => tapNote("deck1.cue")}>
              CUE
            </button>
          </div>
          <div className="mb-transport-deck right">
            <button type="button" className="mb-set" onClick={() => tapNote("deck2.cue")}>
              CUE
            </button>
            <span className="mb-dock-bpm">{formatEffectiveBpm(bpm2, values["deck2.pitch"])}</span>
            <button
              type="button"
              className={`mb-sync${pressed["deck2.sync"] ? " on" : ""}`}
              onClick={() => tapNote("deck2.sync")}
            >
              SYNC
            </button>
          </div>
        </div>

        <div className="mb-play-row">
          <button
            type="button"
            className={`mb-play${playing1 ? " on" : ""}`}
            aria-pressed={playing1}
            aria-label="Deck 1 play"
            onClick={() => tapNote("deck1.play")}
          >
            <span className="mb-play-icon" aria-hidden />
          </button>
          <Fader id="crossfader" value={values.crossfader} vertical={false} label="Crossfader" />
          <button
            type="button"
            className={`mb-play${playing2 ? " on" : ""}`}
            aria-pressed={playing2}
            aria-label="Deck 2 play"
            onClick={() => tapNote("deck2.play")}
          >
            <span className="mb-play-icon" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
