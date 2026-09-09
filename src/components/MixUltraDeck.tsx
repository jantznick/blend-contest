/**
 * Schematic matching DJControl Mix Ultra physical layout:
 * jogs + pitch on top, SYNC/CUE/PLAY under jogs, pad modes + pads below,
 * mixer strip in the center (EQ/FILTER/LOAD/volumes/crossfader).
 *
 * When `interactive`, pointer/touch writes the same MIDI bus as a physical controller.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  injectControlCc,
  injectControlNote,
  injectJog,
  injectPad,
  PAD_MODE_BASE,
} from "../midi/inject";
import type { MixUltraControl } from "../midi/mixUltraMap";

export type DeckHighlight = MixUltraControl | null;

function hot(
  id: MixUltraControl,
  highlight: DeckHighlight,
  activeIds: MixUltraControl[],
  pressed?: boolean,
  latched?: boolean,
) {
  return highlight === id || activeIds.includes(id) || !!pressed || !!latched;
}

function clamp127(n: number) {
  return Math.max(0, Math.min(127, Math.round(n)));
}

function Knob({
  id,
  label,
  highlight,
  activeIds,
  rotation,
  interactive,
}: {
  id: MixUltraControl;
  label: string;
  highlight: DeckHighlight;
  activeIds: MixUltraControl[];
  rotation?: number | null;
  interactive?: boolean;
}) {
  const on = hot(id, highlight, activeIds);
  const value = rotation == null ? 64 : rotation;
  const deg = -135 + (value / 127) * 270;
  const dragRef = useRef<{ y: number; start: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, start: value };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!interactive || !dragRef.current) return;
    const delta = dragRef.current.y - e.clientY;
    injectControlCc(id, clamp127(dragRef.current.start + delta));
  };

  const endDrag = (e: ReactPointerEvent) => {
    if (!interactive) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onDoubleClick = () => {
    if (!interactive) return;
    injectControlCc(id, 64);
  };

  return (
    <div
      className={`mx-knob${on ? " hot" : ""}${interactive ? " interactive" : ""}`}
      title={interactive ? `${label} — drag up/down · double-click center` : label}
      role={interactive ? "slider" : undefined}
      aria-label={label}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 127 : undefined}
      aria-valuenow={interactive ? value : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
    >
      <div className="mx-knob-cap">
        <span className="mx-knob-pointer" style={{ transform: `rotate(${deg}deg)` }} />
      </div>
      <span className="mx-knob-label">{label}</span>
    </div>
  );
}

function Fader({
  id,
  highlight,
  activeIds,
  value,
  vertical = true,
  interactive,
  label,
}: {
  id: MixUltraControl;
  highlight: DeckHighlight;
  activeIds: MixUltraControl[];
  value?: number | null;
  vertical?: boolean;
  interactive?: boolean;
  label?: string;
}) {
  const on = hot(id, highlight, activeIds);
  const v = value == null ? 64 : value;
  const pct = (v / 127) * 100;
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let next: number;
      if (vertical) {
        const t = (rect.bottom - clientY) / rect.height;
        next = clamp127(t * 127);
      } else {
        const t = (clientX - rect.left) / rect.width;
        next = clamp127(t * 127);
      }
      injectControlCc(id, next);
    },
    [id, vertical],
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setFromClient(e.clientX, e.clientY);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!interactive || e.buttons === 0) return;
    setFromClient(e.clientX, e.clientY);
  };

  return (
    <div
      className={`mx-fader${vertical ? " vert" : " horiz"}${on ? " hot" : ""}${interactive ? " interactive" : ""}`}
      title={label ?? id}
      role={interactive ? "slider" : undefined}
      aria-label={label ?? id}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 127 : undefined}
      aria-valuenow={interactive ? v : undefined}
      aria-orientation={interactive ? (vertical ? "vertical" : "horizontal") : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <div className="mx-fader-track" ref={trackRef}>
        <span
          className="mx-fader-thumb"
          style={vertical ? { bottom: `${pct}%` } : { left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Btn({
  id,
  label,
  highlight,
  activeIds,
  pressed,
  latched,
  kind = "",
  interactive,
}: {
  id?: MixUltraControl;
  label: string;
  highlight: DeckHighlight;
  activeIds: MixUltraControl[];
  pressed?: boolean;
  latched?: boolean;
  kind?: string;
  interactive?: boolean;
}) {
  const on = id ? hot(id, highlight, activeIds, pressed, latched) : !!latched || !!pressed;
  const canPress = interactive && !!id;

  const down = (e: ReactPointerEvent) => {
    if (!canPress || !id) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    injectControlNote(id, true);
  };

  const up = (e: ReactPointerEvent) => {
    if (!canPress || !id) return;
    injectControlNote(id, false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  return (
    <div
      className={`mx-btn ${kind}${on ? " hot" : ""}${canPress ? " interactive" : ""}`}
      title={label}
      role={canPress ? "button" : undefined}
      aria-pressed={canPress ? !!pressed || !!latched : undefined}
      tabIndex={canPress ? 0 : undefined}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={
        canPress
          ? (e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                if (id) injectControlNote(id, true);
              }
            }
          : undefined
      }
      onKeyUp={
        canPress
          ? (e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                if (id) injectControlNote(id, false);
              }
            }
          : undefined
      }
    >
      {label}
    </div>
  );
}

type WingProps = {
  deck: 1 | 2;
  highlight: DeckHighlight;
  activeIds: MixUltraControl[];
  values: Partial<Record<MixUltraControl, number | null>>;
  pressed: Partial<Record<MixUltraControl, boolean>>;
  playing?: boolean;
  pads?: boolean[];
  cues?: (number | null)[];
  jogAngle?: number;
  padMode?: string;
  interactive?: boolean;
  onPadModeChange?: (mode: string) => void;
  shiftLatched?: boolean;
  onShiftLatch?: (on: boolean) => void;
  /** Optional loaded-track label (e.g. Free Play Tidal title). */
  trackLabel?: string | null;
};

function DeckWing({
  deck,
  highlight,
  activeIds,
  values,
  pressed,
  playing,
  pads = [],
  cues = [],
  jogAngle = 0,
  padMode = "HOT CUE",
  interactive,
  onPadModeChange,
  shiftLatched,
  onShiftLatch,
  trackLabel,
}: WingProps) {
  const p = (name: string) => `deck${deck}.${name}` as MixUltraControl;
  const outer = deck === 1;
  const touching = !!pressed[p("jogTouch")];
  const lastJogX = useRef<number | null>(null);

  const jogDown = (e: ReactPointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    lastJogX.current = e.clientX;
    injectControlNote(p("jogTouch"), true);
  };

  const jogMove = (e: ReactPointerEvent) => {
    if (!interactive || lastJogX.current == null) return;
    const dx = e.clientX - lastJogX.current;
    lastJogX.current = e.clientX;
    const steps = Math.trunc(dx / 2);
    if (steps !== 0) injectJog(deck, steps);
  };

  const jogUp = (e: ReactPointerEvent) => {
    if (!interactive) return;
    lastJogX.current = null;
    injectControlNote(p("jogTouch"), false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const padPointer = (pad: number, down: boolean, shiftKey: boolean) => {
    if (!interactive) return;
    const modeBase = PAD_MODE_BASE[padMode] ?? 0;
    const clear = (shiftKey || !!shiftLatched) && modeBase === 0;
    injectPad(deck, pad, down, { clear, modeBase });
  };

  const jogBlock = (
    <div className="mx-jog-block">
      {trackLabel ? (
        <p className="mx-deck-track" title={trackLabel}>
          {trackLabel}
        </p>
      ) : null}
      <div
        className={`mx-jog${playing ? " on" : ""}${touching ? " touch" : ""}${interactive ? " interactive" : ""}`}
        title={interactive ? "Drag to nudge" : undefined}
        role={interactive ? "slider" : undefined}
        aria-label={`Deck ${deck} jog`}
        onPointerDown={jogDown}
        onPointerMove={jogMove}
        onPointerUp={jogUp}
        onPointerCancel={jogUp}
      >
        <div className="mx-jog-ring" style={{ transform: `rotate(${jogAngle}deg)` }}>
          <div className={`mx-jog-hub${playing && !touching ? " spinning" : ""}`}>{deck}</div>
        </div>
      </div>
      <div className="mx-transport">
        <Btn
          id={p("sync")}
          label="SYNC"
          kind="sync"
          highlight={highlight}
          activeIds={activeIds}
          pressed={pressed[p("sync")]}
          interactive={interactive}
        />
        <Btn
          id={p("cue")}
          label="CUE"
          kind="cue"
          highlight={highlight}
          activeIds={activeIds}
          pressed={pressed[p("cue")]}
          interactive={interactive}
        />
        <Btn
          id={p("play")}
          label="PLAY"
          kind="play"
          highlight={highlight}
          activeIds={activeIds}
          pressed={pressed[p("play")]}
          latched={playing}
          interactive={interactive}
        />
      </div>
    </div>
  );

  const pitch = (
    <div className="mx-pitch">
      <span className="mx-pitch-label">TEMPO</span>
      <Fader
        id={p("pitch")}
        highlight={highlight}
        activeIds={activeIds}
        value={values[p("pitch")]}
        vertical
        interactive={interactive}
        label={`Deck ${deck} tempo`}
      />
    </div>
  );

  return (
    <div className={`mx-wing deck-${deck}`}>
      <div className="mx-wing-top">
        {outer ? (
          <>
            {pitch}
            {jogBlock}
          </>
        ) : (
          <>
            {jogBlock}
            {pitch}
          </>
        )}
      </div>

      <div className="mx-modes" role="group" aria-label={`Deck ${deck} pad mode`}>
        {(["HOT CUE", "LOOP", "FX", "NEURAL"] as const).map((m) => (
          <div
            key={m}
            className={`mx-mode${padMode === m ? " on" : ""}${interactive ? " interactive" : ""}`}
            aria-current={padMode === m ? "true" : undefined}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={
              interactive
                ? () => {
                    onPadModeChange?.(m);
                  }
                : undefined
            }
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      onPadModeChange?.(m);
                    }
                  }
                : undefined
            }
          >
            {m}
          </div>
        ))}
      </div>
      {interactive && (
        <div
          className={`mx-mode mx-shift${shiftLatched ? " on" : ""} interactive`}
          role="button"
          aria-pressed={!!shiftLatched}
          tabIndex={0}
          title="Latch SHIFT, then tap a pad to clear a hot cue (or hold keyboard Shift)"
          onClick={() => onShiftLatch?.(!shiftLatched)}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              onShiftLatch?.(!shiftLatched);
            }
          }}
        >
          SHIFT
        </div>
      )}

      <div className="mx-pads" role="group" aria-label={`Deck ${deck} performance pads`}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className={`mx-pad${pads[i] ? " hit" : ""}${cues[i] != null ? " set" : ""}${interactive ? " interactive" : ""}`}
            role={interactive ? "button" : undefined}
            aria-label={`Pad ${i + 1}`}
            tabIndex={interactive ? 0 : undefined}
            onPointerDown={
              interactive
                ? (e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    padPointer(i, true, e.shiftKey);
                  }
                : undefined
            }
            onPointerUp={
              interactive
                ? (e) => {
                    padPointer(i, false, e.shiftKey);
                  }
                : undefined
            }
            onPointerCancel={
              interactive
                ? (e) => {
                    padPointer(i, false, e.shiftKey);
                  }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

type Props = {
  highlight?: DeckHighlight;
  activeIds?: MixUltraControl[];
  values?: Partial<Record<MixUltraControl, number | null>>;
  pressed?: Partial<Record<MixUltraControl, boolean>>;
  playing1?: boolean;
  playing2?: boolean;
  pads1?: boolean[];
  pads2?: boolean[];
  cues1?: (number | null)[];
  cues2?: (number | null)[];
  jogAngle1?: number;
  jogAngle2?: number;
  padMode1?: string;
  padMode2?: string;
  prompt?: string;
  status?: string;
  /** Pointer/touch drives the MIDI bus (works with or without a controller). */
  interactive?: boolean;
  onPadModeChange?: (deck: 1 | 2, mode: string) => void;
  trackLabel1?: string | null;
  trackLabel2?: string | null;
};

export function MixUltraDeck({
  highlight = null,
  activeIds = [],
  values = {},
  pressed = {},
  playing1 = false,
  playing2 = false,
  pads1,
  pads2,
  cues1,
  cues2,
  jogAngle1 = 0,
  jogAngle2 = 0,
  padMode1 = "HOT CUE",
  padMode2 = "HOT CUE",
  prompt,
  status,
  interactive = false,
  onPadModeChange,
  trackLabel1 = null,
  trackLabel2 = null,
}: Props) {
  const [mode1, setMode1] = useState(padMode1);
  const [mode2, setMode2] = useState(padMode2);
  const [shift1, setShift1] = useState(false);
  const [shift2, setShift2] = useState(false);

  useEffect(() => {
    setMode1(padMode1);
  }, [padMode1]);
  useEffect(() => {
    setMode2(padMode2);
  }, [padMode2]);

  const setPadMode1 = (m: string) => {
    setMode1(m);
    onPadModeChange?.(1, m);
  };
  const setPadMode2 = (m: string) => {
    setMode2(m);
    onPadModeChange?.(2, m);
  };

  return (
    <div className={`mx-deck-wrap${interactive ? " mx-interactive" : ""}`}>
      {(prompt || status) && (
        <div className="mx-deck-hud">
          {prompt && <p className="mx-deck-prompt">{prompt}</p>}
          {status && <p className="mx-deck-status">{status}</p>}
        </div>
      )}

      <div
        className="mx-deck"
        role={interactive ? "group" : "img"}
        aria-label="Mix Ultra controller"
      >
        <DeckWing
          deck={1}
          highlight={highlight}
          activeIds={activeIds}
          values={values}
          pressed={pressed}
          playing={playing1}
          pads={pads1}
          cues={cues1}
          jogAngle={jogAngle1}
          padMode={mode1}
          interactive={interactive}
          onPadModeChange={setPadMode1}
          shiftLatched={shift1}
          onShiftLatch={setShift1}
          trackLabel={trackLabel1}
        />

        <div className="mx-center">
          <div className="mx-browser-row">
            <Btn label="LOAD 1" highlight={highlight} activeIds={activeIds} kind="load" />
            <div className="mx-browser">
              <div className="mx-browser-knob" />
              <span>BROWSER</span>
            </div>
            <Btn label="LOAD 2" highlight={highlight} activeIds={activeIds} kind="load" />
          </div>

          <div className="mx-eq-strip">
            <div className="mx-eq-col">
              <Knob
                id="deck1.high"
                label="HI"
                highlight={highlight}
                activeIds={activeIds}
                rotation={values["deck1.high"]}
                interactive={interactive}
              />
              <Knob
                id="deck1.mid"
                label="MID"
                highlight={highlight}
                activeIds={activeIds}
                rotation={values["deck1.mid"]}
                interactive={interactive}
              />
              <Knob
                id="deck1.low"
                label="LOW"
                highlight={highlight}
                activeIds={activeIds}
                rotation={values["deck1.low"]}
                interactive={interactive}
              />
              <Knob
                id="deck1.filter"
                label="FILTER"
                highlight={highlight}
                activeIds={activeIds}
                rotation={values["deck1.filter"]}
                interactive={interactive}
              />
              <Btn
                id="deck1.headphone"
                label="PHONES"
                kind="phones"
                highlight={highlight}
                activeIds={activeIds}
                pressed={pressed["deck1.headphone"]}
                interactive={interactive}
              />
            </div>

            <div className="mx-master-col">
              <Btn label="N" highlight={highlight} activeIds={activeIds} kind="neural" />
              <Knob
                id="master"
                label="MASTER"
                highlight={highlight}
                activeIds={activeIds}
                rotation={values.master}
                interactive={interactive}
              />
            </div>

            <div className="mx-eq-col">
              <Knob
                id="deck2.high"
                label="HI"
                highlight={highlight}
                activeIds={activeIds}
                rotation={values["deck2.high"]}
                interactive={interactive}
              />
              <Knob
                id="deck2.mid"
                label="MID"
                highlight={highlight}
                activeIds={activeIds}
                rotation={values["deck2.mid"]}
                interactive={interactive}
              />
              <Knob
                id="deck2.low"
                label="LOW"
                highlight={highlight}
                activeIds={activeIds}
                rotation={values["deck2.low"]}
                interactive={interactive}
              />
              <Knob
                id="deck2.filter"
                label="FILTER"
                highlight={highlight}
                activeIds={activeIds}
                rotation={values["deck2.filter"]}
                interactive={interactive}
              />
              <Btn
                id="deck2.headphone"
                label="PHONES"
                kind="phones"
                highlight={highlight}
                activeIds={activeIds}
                pressed={pressed["deck2.headphone"]}
                interactive={interactive}
              />
            </div>
          </div>

          <div className="mx-fader-row">
            <Fader
              id="deck1.volume"
              highlight={highlight}
              activeIds={activeIds}
              value={values["deck1.volume"]}
              vertical
              interactive={interactive}
              label="Deck 1 volume"
            />
            <div className="mx-xfader-block">
              <Fader
                id="crossfader"
                highlight={highlight}
                activeIds={activeIds}
                value={values.crossfader}
                vertical={false}
                interactive={interactive}
                label="Crossfader"
              />
              <div className="mx-xfader-ends">
                <span>1</span>
                <span>2</span>
              </div>
            </div>
            <Fader
              id="deck2.volume"
              highlight={highlight}
              activeIds={activeIds}
              value={values["deck2.volume"]}
              vertical
              interactive={interactive}
              label="Deck 2 volume"
            />
          </div>
        </div>

        <DeckWing
          deck={2}
          highlight={highlight}
          activeIds={activeIds}
          values={values}
          pressed={pressed}
          playing={playing2}
          pads={pads2}
          cues={cues2}
          jogAngle={jogAngle2}
          padMode={mode2}
          interactive={interactive}
          onPadModeChange={setPadMode2}
          shiftLatched={shift2}
          onShiftLatch={setShift2}
          trackLabel={trackLabel2}
        />
      </div>
    </div>
  );
}
