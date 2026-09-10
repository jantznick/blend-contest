import { useEffect, useId, useRef, useState } from "react";
import { useHardwareArm } from "../context/HardwareArmContext";
import { useMidiActivity } from "../midi/useMidiBus";
import { describeMappedControl, formatMidiActivity } from "../midi/statusCopy";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Last mapped Mix Ultra control id from the live controller. */
  lastControl?: string | null;
};

export function TroubleshootingModal({ open, onClose, lastControl }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const { status, arming, arm, error } = useHardwareArm();
  const activity = useMidiActivity();
  const mappedFromActivity = describeMappedControl(activity);
  const rawLine = formatMidiActivity(activity);

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

  const inputs = status.status === "ready" ? status.inputs : [];
  const hardwareSeen =
    activity?.source === "hardware" && Date.now() - activity.at < 15_000;
  const mappedOk = Boolean(lastControl || mappedFromActivity);

  return (
    <div className="howto-backdrop" role="presentation">
      <button
        type="button"
        className="howto-scrim"
        aria-label="Close troubleshooting"
        onClick={onClose}
      />
      <div
        className="howto-panel trouble-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="howto-head">
          <div>
            <h2 id={titleId}>Controller troubleshooting</h2>
            <p className="howto-tagline">
              Web MIDI connects on load. Moving a Mix Ultra knob should move the on-screen deck.
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

        <div className="howto-body">
          <section className="howto-section">
            <h3>Live status</h3>
            <ul className="trouble-status">
              <li>
                <strong>Web MIDI:</strong>{" "}
                {status.status === "ready"
                  ? `ready (${status.inputCount} in / ${status.outputCount} out)`
                  : status.status}
                {status.status === "denied" || status.status === "error"
                  ? ` — ${status.message}`
                  : null}
                {error ? ` — ${error}` : null}
              </li>
              <li>
                <strong>Inputs:</strong>{" "}
                {inputs.length
                  ? inputs.map((p) => p.name).join(", ")
                  : status.status === "ready"
                    ? "none detected — plug in the box or quit djay"
                    : "—"}
              </li>
              <li>
                <strong>Last hardware message:</strong>{" "}
                {hardwareSeen && rawLine ? rawLine : "none yet — twist a knob"}
              </li>
              <li>
                <strong>Mapped control:</strong>{" "}
                {lastControl || mappedFromActivity || "waiting for Mix Ultra map match"}
              </li>
            </ul>
            {hardwareSeen && !mappedOk && (
              <p className="midi-banner warn">
                MIDI is arriving, but it doesn’t match the Mix Ultra (djay) map — check the
                controller’s MIDI mode / mapping, or use the on-screen deck.
              </p>
            )}
            <div className="trouble-actions">
              <button
                type="button"
                className="dj-action"
                disabled={arming || status.status === "connecting"}
                onClick={() => void arm()}
              >
                {arming || status.status === "connecting" ? "Connecting…" : "Retry MIDI"}
              </button>
            </div>
          </section>

          <section className="howto-section">
            <h3>Checklist</h3>
            <ol>
              <li>
                Use <strong>Chrome or Edge</strong> on desktop (Web MIDI).
              </li>
              <li>
                Allow the MIDI permission prompt when the page loads (or hit{" "}
                <strong>Retry MIDI</strong>).
              </li>
              <li>
                Quit <strong>djay</strong> / Serato / other DJ hosts — they often take exclusive
                MIDI.
              </li>
              <li>
                Plug in a <strong>Mix Ultra</strong> (or a controller sending the same djay-style
                MIDI map). Other maps won’t move this deck.
              </li>
              <li>
                Twist EQ / filter / XF — the on-screen knobs should mirror before you hit Go. Go
                only starts playback + grading.
              </li>
            </ol>
          </section>

          <section className="howto-section">
            <h3>Still stuck?</h3>
            <ul>
              <li>Unplug / replug USB, then Retry MIDI.</li>
              <li>Confirm the browser site settings didn’t block MIDI permanently.</li>
              <li>
                On-screen pointer / touch controls always work once audio is started with Go —
                hardware is optional.
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

/** Compact header chip — opens troubleshooting when clicked. */
export function MidiStatusChip({
  lastControl,
  onOpenTrouble,
}: {
  lastControl: string | null;
  onOpenTrouble: () => void;
}) {
  const { status } = useHardwareArm();
  const activity = useMidiActivity();
  const [, setFresh] = useState(0);

  useEffect(() => {
    if (!lastControl || !activity) return;
    const t = window.setTimeout(() => setFresh((n) => n + 1), 2600);
    return () => clearTimeout(t);
  }, [lastControl, activity]);

  const recentMapped =
    lastControl && activity && Date.now() - activity.at < 2500 ? lastControl : null;

  let label = "MIDI";
  let tone: "idle" | "warn" | "ok" | "live" = "idle";
  if (status.status === "connecting") {
    label = "MIDI…";
  } else if (status.status === "unsupported") {
    label = "MIDI n/a";
    tone = "warn";
  } else if (status.status === "denied" || status.status === "error") {
    label = "MIDI denied";
    tone = "warn";
  } else if (status.status === "ready") {
    if (status.inputCount === 0) {
      label = "MIDI · no device";
      tone = "warn";
    } else if (recentMapped) {
      label = `MIDI · ${recentMapped}`;
      tone = "live";
    } else {
      label = status.inputCount === 1 ? "MIDI · ready" : `MIDI · ${status.inputCount} ports`;
      tone = "ok";
    }
  }

  return (
    <button
      type="button"
      className={`dj-midi-chip tone-${tone}`}
      onClick={onOpenTrouble}
      title="Controller connection status — open troubleshooting"
    >
      <span className="dj-midi-dot" aria-hidden />
      {label}
    </button>
  );
}
