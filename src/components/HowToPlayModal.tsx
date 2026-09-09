import { useEffect, useId, useRef } from "react";
import { TRANSITION_RECIPES } from "../mix/timingFeedback";

type SectionId = "play" | "modes" | "grading" | "controls";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "play", label: "How to play" },
  { id: "modes", label: "Blend modes" },
  { id: "grading", label: "Grading" },
  { id: "controls", label: "Controls" },
];

const MODE_STEPS: Record<string, string[]> = {
  free: [
    "Always hand off Deck 1 → Deck 2 (XF left → right). Reverse blends are not graded.",
    "Pick any handoff style — long fade, bass carve, filter sweep, or a quick cut.",
    "Match tempos with the pitch/tempo faders before you blend.",
    "Make a clear handoff (crossfader and/or channel faders), then hit Done.",
    "Score looks at tempo, bass hygiene, kick scaffold, and which named move your motion best matches.",
  ],
  "long-blend": [
    "Leave LOW / MID / HIGH near 12 o’clock — this mode is faders only.",
    "Bring Deck 2 in with channel faders and/or a slow crossfader travel left → right (~1–4 bars).",
    "Fade Deck 1 out as Deck 2 takes the room.",
    "Avoid bass swaps or big EQ moves; those belong in Bass swap.",
  ],
  "bass-swap": [
    "Start with both decks in the mix path; park Deck 2 LOW near center, then kill it (left).",
    "Blend XF left → right while only one bassline stays full.",
    "Hand the bass to Deck 2: restore Deck 2 LOW, then kill Deck 1 LOW.",
    "Aim the bass carve for roughly ~2–6 bars at the track BPM.",
  ],
  "filter-open": [
    "On Deck 2, twist Filter right (thin / high-pass feel) before or as you start the blend.",
    "Carve incoming LOW so both kicks don’t muddy the middle of the XF.",
    "Sweep Filter back toward center as you finish the handoff (~1–4 bars).",
    "Crossfade or channel-fade into Deck 2 (left → right) while the filter opens.",
  ],
  "xfader-cut": [
    "Both decks loud, EQ flat at 12 o’clock.",
    "Count a beat or two, then throw the crossfader left → right quickly (~¼–2 bars).",
    "Don’t carve bass or ride MID/HIGH — the cut is the move.",
    "A slightly fast snap can still pass; an incomplete XF travel (or right → left) will not.",
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
              Load two tracks, pick a blend mode, mix the handoff, then get scored.
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
                <strong>Pick beds</strong> — use Beds for a style pair, or load hosted / uploaded
                tracks on each deck (set BPM when uploading).
              </li>
              <li>
                <strong>Choose a blend mode</strong> — Free, Long blend, Bass swap, Filter open, or
                Crossfader cut. Modes lock once you hit Go.
              </li>
              <li>
                <strong>Go</strong> — both decks start playing and motion recording begins. Use the
                on-screen Mix Ultra or a connected controller.
              </li>
              <li>
                <strong>Mix the transition</strong> — match tempo, then hand off{" "}
                <strong>Deck 1 → Deck 2</strong> (crossfader left → right) for your selected mode.
                Reverse blends (Deck 2 → Deck 1) are not graded.
              </li>
              <li>
                <strong>Done</strong> — grading runs on recorded control motion + a tempo/kick
                scaffold. Pass is <strong>70+</strong> with a completed handoff.
              </li>
              <li>
                <strong>Again / Reset</strong> — Again clears the grade so you can retry; Reset also
                stops both decks.
              </li>
            </ol>
          </section>

          <section id="howto-modes" className="howto-section">
            <h3>Blend modes</h3>
            <p>
              Each tab in the header is a recipe the grader listens for. Pick one before Go. Every
              mode expects <strong>Deck 1 outgoing → Deck 2 incoming</strong> (XF left → right).
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
            <h3>How grading works</h3>
            <ul>
              <li>
                <strong>Direction is fixed:</strong> score only Deck 1 → Deck 2. The grader wants
                crossfader left → right, Deck 2 as the incoming deck (bass kill / filter / channel
                fader up), and Deck 1 fading out. Blending the other way usually marks the handoff
                incomplete even if it sounds fine.
              </li>
              <li>
                While you mix, the app records crossfader, EQ, filter, channel faders, pitch, and
                playhead samples — not a full spectral analysis of the audio yet.
              </li>
              <li>
                Dimensions are weighted by mode (handoff timing, bass hygiene, filter sweep, cut
                speed, tempo match, kick scaffold, EQ discipline).
              </li>
              <li>
                Timing windows are phrase-aware (bars at your tracks’ BPM). Tips say if a move was
                too fast, too slow, or incomplete.
              </li>
              <li>
                <strong>Pass ≥ 70</strong>, and the handoff must finish (clear start → end on XF or
                channel faders). Incomplete recordings fail.
              </li>
              <li>
                Free mode also reports the closest named move your motion resembled.
              </li>
              <li>
                Kick / tempo tips are a BPM + pitch scaffold — still trust your ears for the final
                feel.
              </li>
            </ul>
          </section>

          <section id="howto-controls" className="howto-section">
            <h3>Controls</h3>
            <ul>
              <li>
                <strong>On-screen deck</strong> — knobs, jogs, channel faders, and crossfader work
                with pointer / touch after Go starts audio.
              </li>
              <li>
                <strong>Mix Ultra (MIDI)</strong> — optional. Quit other DJ apps if the box won’t
                connect; Chrome/Edge on desktop work best.
              </li>
              <li>
                <strong>Waveforms</strong> — show playhead and cues so you can see where each deck
                sits during the blend.
              </li>
              <li>
                Track selection and blend mode lock while recording or after grading until you hit
                Again or Reset.
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
