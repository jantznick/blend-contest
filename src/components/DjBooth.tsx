/**
 * djay-style dual turntable booth: big platters + compact mixer.
 * Pointer/touch writes the same MIDI bus as Mix Ultra hardware.
 */
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { ReactNode } from "react";
import { injectControlCc, injectControlNote, injectJog } from "../midi/inject";
import type { MixUltraControl } from "../midi/mixUltraMap";
import type { LiveDeckValues, LivePressed } from "../midi/useLiveController";

function clamp127(n: number) {
  return Math.max(0, Math.min(127, Math.round(n)));
}

function Knob({
  id,
  label,
  value,
}: {
  id: MixUltraControl;
  label: string;
  value?: number | null;
}) {
  const v = value == null ? 64 : value;
  const deg = -135 + (v / 127) * 270;
  const dragRef = useRef<{ y: number; start: number } | null>(null);

  return (
    <div
      className="dj-knob"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={127}
      aria-valuenow={v}
      title={`${label} — drag`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { y: e.clientY, start: v };
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return;
        injectControlCc(id, clamp127(dragRef.current.start + (dragRef.current.y - e.clientY)));
      }}
      onPointerUp={(e) => {
        dragRef.current = null;
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* released */
        }
      }}
      onDoubleClick={() => injectControlCc(id, 64)}
    >
      <div className="dj-knob-cap">
        <span className="dj-knob-needle" style={{ transform: `rotate(${deg}deg)` }} />
      </div>
      <span className="dj-knob-label">{label}</span>
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
      className={`dj-fader${vertical ? " vert" : " horiz"}`}
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
      <div className="dj-fader-track" ref={trackRef}>
        <span
          className="dj-fader-thumb"
          style={vertical ? { bottom: `${pct}%` } : { left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Platter({
  deck,
  title,
  bpm,
  playing,
  pressed,
  jogAngle,
  trackSelect,
}: {
  deck: 1 | 2;
  title: string;
  bpm: number;
  playing: boolean;
  pressed: LivePressed;
  jogAngle: number;
  trackSelect: ReactNode;
}) {
  const playId = `deck${deck}.play` as MixUltraControl;
  const cueId = `deck${deck}.cue` as MixUltraControl;
  const touching = !!pressed[`deck${deck}.jogTouch` as MixUltraControl];
  const lastX = useRef<number | null>(null);

  const jogDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    lastX.current = e.clientX;
    injectControlNote(`deck${deck}.jogTouch` as MixUltraControl, true);
  };
  const jogMove = (e: ReactPointerEvent) => {
    if (lastX.current == null) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    const steps = Math.trunc(dx / 2);
    if (steps !== 0) injectJog(deck, steps);
  };
  const jogUp = (e: ReactPointerEvent) => {
    lastX.current = null;
    injectControlNote(`deck${deck}.jogTouch` as MixUltraControl, false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* released */
    }
  };

  const tap = (id: MixUltraControl) => {
    injectControlNote(id, true);
    window.setTimeout(() => injectControlNote(id, false), 80);
  };

  return (
    <section className={`dj-platter-col deck-${deck}`}>
      <div className="dj-platter-meta">
        <span className="dj-platter-deck">Deck {deck}</span>
        <span className="dj-platter-title" title={title}>
          {title}
        </span>
        <span className="dj-platter-bpm">{bpm} BPM</span>
      </div>
      {trackSelect}
      <div
        className={`dj-platter${playing ? " on" : ""}${touching ? " touch" : ""}`}
        role="slider"
        aria-label={`Deck ${deck} platter — drag to nudge`}
        onPointerDown={jogDown}
        onPointerMove={jogMove}
        onPointerUp={jogUp}
        onPointerCancel={jogUp}
      >
        <div className="dj-platter-disc" style={{ transform: `rotate(${jogAngle}deg)` }}>
          <div className={`dj-platter-vinyl${playing && !touching ? " spinning" : ""}`}>
            <span className="dj-platter-grooves" aria-hidden />
            <span className="dj-platter-label">
              <span className="dj-platter-spindle" />
              <span className="dj-platter-num">{deck}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="dj-transport">
        <button type="button" className="dj-tbtn cue" onClick={() => tap(cueId)}>
          Cue
        </button>
        <button
          type="button"
          className={`dj-tbtn play${playing ? " on" : ""}`}
          onClick={() => tap(playId)}
        >
          {playing ? "Pause" : "Play"}
        </button>
      </div>
    </section>
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
  select1: ReactNode;
  select2: ReactNode;
};

export function DjBooth({
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
  select1,
  select2,
}: Props) {
  return (
    <div className="dj-booth" role="group" aria-label="Turntables">
      <Platter
        deck={1}
        title={title1}
        bpm={bpm1}
        playing={playing1}
        pressed={pressed}
        jogAngle={jogAngle1}
        trackSelect={select1}
      />

      <aside className="dj-mixer" aria-label="Mixer">
        <div className="dj-eq-pair">
          <div className="dj-eq-col">
            <Knob id="deck1.high" label="Hi" value={values["deck1.high"]} />
            <Knob id="deck1.mid" label="Mid" value={values["deck1.mid"]} />
            <Knob id="deck1.low" label="Low" value={values["deck1.low"]} />
            <Knob id="deck1.filter" label="Filter" value={values["deck1.filter"]} />
          </div>
          <div className="dj-eq-col">
            <Knob id="deck2.high" label="Hi" value={values["deck2.high"]} />
            <Knob id="deck2.mid" label="Mid" value={values["deck2.mid"]} />
            <Knob id="deck2.low" label="Low" value={values["deck2.low"]} />
            <Knob id="deck2.filter" label="Filter" value={values["deck2.filter"]} />
          </div>
        </div>

        <div className="dj-vol-row">
          <Fader id="deck1.volume" value={values["deck1.volume"]} label="Deck 1 volume" />
          <Fader id="deck2.volume" value={values["deck2.volume"]} label="Deck 2 volume" />
        </div>

        <div className="dj-xf-wrap">
          <span>1</span>
          <Fader
            id="crossfader"
            value={values.crossfader}
            vertical={false}
            label="Crossfader"
          />
          <span>2</span>
        </div>
      </aside>

      <Platter
        deck={2}
        title={title2}
        bpm={bpm2}
        playing={playing2}
        pressed={pressed}
        jogAngle={jogAngle2}
        trackSelect={select2}
      />
    </div>
  );
}
