/**
 * Dual-deck booth UI: CDJ-style platters + mixer chassis.
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
      className="hw-knob"
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
        injectControlCc(id, clamp127(dragRef.current.start + (dragRef.current.y - e.clientY) * 0.9));
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
      <div className="hw-knob-body">
        <div className="hw-knob-ticks" aria-hidden />
        <div className="hw-knob-cap" style={{ transform: `rotate(${deg}deg)` }}>
          <span className="hw-knob-mark" />
        </div>
      </div>
      <span className="hw-knob-label">{label}</span>
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
      className={`hw-fader${vertical ? " vert" : " horiz"}`}
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
      <div className="hw-fader-rail" ref={trackRef}>
        <span
          className="hw-fader-cap"
          style={vertical ? { bottom: `${pct}%` } : { left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Deck({
  deck,
  title,
  bpm,
  playing,
  pressed,
  jogAngle,
  pitch,
  trackSelect,
}: {
  deck: 1 | 2;
  title: string;
  bpm: number;
  playing: boolean;
  pressed: LivePressed;
  jogAngle: number;
  pitch?: number | null;
  trackSelect: ReactNode;
}) {
  const playId = `deck${deck}.play` as MixUltraControl;
  const cueId = `deck${deck}.cue` as MixUltraControl;
  const pitchId = `deck${deck}.pitch` as MixUltraControl;
  const touching = !!pressed[`deck${deck}.jogTouch` as MixUltraControl];
  const lastX = useRef<number | null>(null);
  const outer = deck === 1;

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

  const pitchEl = (
    <div className="hw-pitch">
      <span>TEMPO</span>
      <Fader id={pitchId} value={pitch} label={`Deck ${deck} tempo`} />
    </div>
  );

  const jog = (
    <div
      className={`hw-jog${playing ? " on" : ""}${touching ? " touch" : ""}`}
      role="slider"
      aria-label={`Deck ${deck} jog`}
      onPointerDown={jogDown}
      onPointerMove={jogMove}
      onPointerUp={jogUp}
      onPointerCancel={jogUp}
    >
      <div className="hw-jog-bezel">
        <div className="hw-jog-ring" style={{ transform: `rotate(${jogAngle}deg)` }}>
          <div className={`hw-jog-vinyl${playing && !touching ? " spinning" : ""}`}>
            <span className="hw-jog-grooves" aria-hidden />
            <span className="hw-jog-sheen" aria-hidden />
            <span className="hw-jog-sticker">
              <span className="hw-jog-spindle" />
              <span className="hw-jog-num">{deck}</span>
            </span>
          </div>
        </div>
        <div className={`hw-jog-led${playing ? " lit" : ""}`} aria-hidden />
      </div>
    </div>
  );

  return (
    <section className={`hw-deck deck-${deck}`}>
      <header className="hw-deck-head">
        <div className="hw-deck-badge">DECK {deck}</div>
        <div className="hw-deck-track">
          <strong title={title}>{title}</strong>
          <span>{bpm} BPM</span>
        </div>
        {trackSelect}
      </header>

      <div className="hw-deck-main">
        {outer ? (
          <>
            {pitchEl}
            {jog}
          </>
        ) : (
          <>
            {jog}
            {pitchEl}
          </>
        )}
      </div>

      <div className="hw-transport">
        <button type="button" className="hw-cue" onClick={() => tap(cueId)}>
          CUE
        </button>
        <button
          type="button"
          className={`hw-play${playing ? " on" : ""}`}
          onClick={() => tap(playId)}
          aria-pressed={playing}
        >
          <span className="hw-play-icon" aria-hidden />
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
    <div className="hw-chassis" role="group" aria-label="DJ controller">
      <Deck
        deck={1}
        title={title1}
        bpm={bpm1}
        playing={playing1}
        pressed={pressed}
        jogAngle={jogAngle1}
        pitch={values["deck1.pitch"]}
        trackSelect={select1}
      />

      <aside className="hw-mixer" aria-label="Mixer">
        <div className="hw-mixer-top">
          <span className="hw-mixer-tag">MIX</span>
        </div>
        <div className="hw-eq-grid">
          <div className="hw-eq-col">
            <Knob id="deck1.high" label="HI" value={values["deck1.high"]} />
            <Knob id="deck1.mid" label="MID" value={values["deck1.mid"]} />
            <Knob id="deck1.low" label="LOW" value={values["deck1.low"]} />
            <Knob id="deck1.filter" label="FLT" value={values["deck1.filter"]} />
          </div>
          <div className="hw-eq-col">
            <Knob id="deck2.high" label="HI" value={values["deck2.high"]} />
            <Knob id="deck2.mid" label="MID" value={values["deck2.mid"]} />
            <Knob id="deck2.low" label="LOW" value={values["deck2.low"]} />
            <Knob id="deck2.filter" label="FLT" value={values["deck2.filter"]} />
          </div>
        </div>

        <div className="hw-channel-faders">
          <div className="hw-ch">
            <span>1</span>
            <Fader id="deck1.volume" value={values["deck1.volume"]} label="Deck 1 volume" />
          </div>
          <div className="hw-ch">
            <span>2</span>
            <Fader id="deck2.volume" value={values["deck2.volume"]} label="Deck 2 volume" />
          </div>
        </div>

        <div className="hw-xf">
          <span>A</span>
          <Fader id="crossfader" value={values.crossfader} vertical={false} label="Crossfader" />
          <span>B</span>
        </div>
      </aside>

      <Deck
        deck={2}
        title={title2}
        bpm={bpm2}
        playing={playing2}
        pressed={pressed}
        jogAngle={jogAngle2}
        pitch={values["deck2.pitch"]}
        trackSelect={select2}
      />
    </div>
  );
}
