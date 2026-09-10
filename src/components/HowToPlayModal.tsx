import { useEffect, useId, useRef } from "react";
import { TRANSITION_RECIPES } from "../mix/timingFeedback";

type SectionId = "play" | "modes" | "grading" | "controls";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "play", label: "How to play" },
  { id: "modes", label: "Blend modes" },
  { id: "grading", label: "Scoring" },
  { id: "controls", label: "Controls" },
];

/** Plain-language steps for non-DJs. Knob names (LOW, Filter) match the on-screen labels. */
const MODE_STEPS: Record<string, string[]> = {
  free: [
    "Always switch from Deck 1 → Deck 2. Going the other way doesn’t count.",
    "Move to Deck 2 with the bottom crossfader (left → right), or raise Deck 2’s volume fader and lower Deck 1’s (the bottom slider can stay in the middle).",
    "Any style is fine: a slow fade, a bass swap, a Filter move, or a quick cut.",
    "Before you blend, line up the speeds with each deck’s tempo slider so both BPM numbers match.",
    "We score tempo match, whether two basslines clash, and how cleanly you finished the switch.",
  ],
  "long-blend": [
    "Leave the EQ knobs (LOW / MID / HIGH) in the middle — this mode is volume only.",
    "Fade Deck 2 in with its volume fader and/or slowly slide the bottom crossfader left → right over a few seconds.",
    "Fade Deck 1 out as Deck 2 takes over.",
    "Don’t turn bass knobs for this mode — that’s the Bass swap challenge.",
  ],
  "bass-swap": [
    "Start with both songs audible. On Deck 2, turn the LOW (bass) knob left to remove its bass.",
    "Blend the songs with the crossfader (left → right) or the volume faders — only one bassline should be full at a time.",
    "Give Deck 2 the bass: turn Deck 2’s LOW back to the middle, then turn Deck 1’s LOW left.",
    "Take a few seconds for that bass hand-off — don’t rush it in one snap.",
  ],
  "filter-open": [
    "On Deck 2, twist Filter right so the track sounds thinner/brighter before you blend.",
    "Turn Deck 2’s LOW (bass) left while both songs are playing so the kicks don’t fight.",
    "As you finish switching to Deck 2, bring Filter back toward the middle.",
    "Finish on Deck 2 with the crossfader (left → right) or by raising Deck 2’s volume and lowering Deck 1’s.",
  ],
  "xfader-cut": [
    "Both decks loud, EQ knobs in the middle — this mode needs the bottom crossfader.",
    "Count a beat or two, then quickly slide the crossfader left → right (about one beat to two bars).",
    "Don’t turn bass or MID/HIGH for this one — the quick slider move is the whole trick.",
    "A slightly fast cut can still pass; stopping halfway or going right → left will not.",
  ],
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HowToPlayModal({ open, onClose }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="howto-backdrop" role="presentation">
      <button
        type="button"
        className="howto-scrim"
        aria-label="Close how to play"
        onClick={onClose}
      />
      <div
        className="howto-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="howto-head">
          <div>
            <h2 id={titleId}>How to play</h2>
            <p className="howto-tagline">
              Load two songs, pick a blend style, switch from Deck 1 to Deck 2, then get a score.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="howto-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <nav className="howto-toc" aria-label="Help sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#howto-${s.id}`}>
              {s.label}
            </a>
          ))}
        </nav>

        <div className="howto-body">
          <section id="howto-play" className="howto-section">
            <h3>Step by step</h3>
            <ol>
              <li>
                <strong>Pick songs</strong> — use Beds for a style pair, or load a track on each
                deck (set BPM when you upload).
              </li>
              <li>
                <strong>Choose a blend mode</strong> — Free, Long blend, Bass swap, Filter open, or
                Crossfader cut. The choice locks when you hit Go.
              </li>
              <li>
                <strong>Controller (optional)</strong> — MIDI connects when the page loads (see the
                MIDI chip / Troubleshoot). Twist a knob before Go; the on-screen deck should move
                with it.
              </li>
              <li>
                <strong>Go</strong> — both decks start playing and we start recording your moves.
                Use the on-screen deck or a plugged-in controller.
              </li>
              <li>
                <strong>Switch songs</strong> — match the BPM numbers first, then move from{" "}
                <strong>Deck 1 → Deck 2</strong>. Use the bottom crossfader (left → right){" "}
                <em>or</em> Deck 2’s volume up and Deck 1’s volume down. The other way around doesn’t
                count. Crossfader cut must use the bottom slider.
              </li>
              <li>
                <strong>Done</strong> — we score how you moved the controls (not a full audio
                analysis yet). Pass is <strong>70+</strong> with a finished switch to Deck 2.
              </li>
              <li>
                <strong>Again / Reset</strong> — Again clears the score so you can retry; Reset also
                stops both decks.
              </li>
            </ol>
          </section>

          <section id="howto-modes" className="howto-section">
            <h3>Blend modes</h3>
            <p>
              Each tab in the header is a style we’re listening for. Pick one before Go. Every mode
              expects <strong>Deck 1 out → Deck 2 in</strong>. You can usually use either the bottom
              crossfader or the two volume faders (Crossfader cut is the exception — bottom slider
              only).
            </p>
            <p className="howto-glossary">
              <strong>Quick labels:</strong> LOW = bass knob · MID / HIGH = mid / treble · Filter =
              thin/bright knob · Crossfader = bottom left↔right slider · “Middle” on a knob = neutral
              (straight up).
            </p>
            <div className="howto-modes">
              {TRANSITION_RECIPES.map((r) => (
                <article key={r.id} className="howto-mode">
                  <h4>{r.title}</h4>
                  <p className="howto-mode-blurb">{r.blurb}</p>
                  <ol>
                    {(MODE_STEPS[r.id] ?? []).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </section>

          <section id="howto-grading" className="howto-section">
            <h3>How scoring works</h3>
            <ul>
              <li>
                <strong>Direction is fixed:</strong> we only score Deck 1 → Deck 2. Deck 2 is the
                song you’re bringing in; Deck 1 fades out. The reverse usually fails even if it
                sounded fine.
              </li>
              <li>
                <strong>Two ways to switch:</strong> slide the bottom crossfader fully left → right,{" "}
                <em>or</em> raise Deck 2’s volume and lower Deck 1’s.{" "}
                <strong>Crossfader cut</strong> must use the bottom slider.
              </li>
              <li>
                While you mix, we record the crossfader, EQ knobs, Filter, volume faders, tempo, and
                playhead — not a full “listen to the audio” analysis yet.
              </li>
              <li>
                Tips call out tempo match, whether two basslines clashed, Filter timing, cut speed,
                and whether you finished the switch.
              </li>
              <li>
                <strong>Pass ≥ 70</strong>, and you must finish moving onto Deck 2. Incomplete
                recordings fail.
              </li>
              <li>Free mode also names which style your moves looked most like.</li>
              <li>Tempo tips use the BPM numbers — still trust your ears for the feel.</li>
            </ul>
          </section>

          <section id="howto-controls" className="howto-section">
            <h3>Controls</h3>
            <ul>
              <li>
                <strong>On-screen deck</strong> — knobs, platters, volume faders, and the bottom
                crossfader work with mouse or touch after Go starts audio.
              </li>
              <li>
                <strong>Mix Ultra (optional)</strong> — connects on page load. Quit other DJ apps if
                the box doesn’t show up; Chrome/Edge on desktop work best. Use{" "}
                <strong>Troubleshoot</strong> if knobs don’t mirror.
              </li>
              <li>
                <strong>BPM while pitching</strong> — the big number next to each tempo slider is the
                live speed of that song; match Deck 1 and Deck 2 before you blend.
              </li>
              <li>
                Track and mode choices lock while you’re recording or after a score until Again or
                Reset.
              </li>
            </ul>
          </section>
        </div>

        <footer className="howto-foot">
          <button type="button" className="dj-action primary" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}
