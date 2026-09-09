import { useId, useRef, useState } from "react";
import {
  getBundledTracks,
  registerUploadedTrack,
  type TrackId,
  type TrackInfo,
} from "../audio/tracks";

type Props = {
  tracks: TrackInfo[];
  track1: TrackId;
  track2: TrackId;
  locked?: boolean;
  hint?: string;
  onSelect: (deck: 1 | 2, id: TrackId) => void;
  /** After upload decode, parent should load the new id onto the deck. */
  onUploaded: (deck: 1 | 2, id: TrackId) => void;
};

async function decodeFile(file: File): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    const data = await file.arrayBuffer();
    return await ctx.decodeAudioData(data.slice(0));
  } finally {
    void ctx.close();
  }
}

function DeckPicker({
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
  locked?: boolean;
  onSelect: (deck: 1 | 2, id: TrackId) => void;
  onUploaded: (deck: 1 | 2, id: TrackId) => void;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bpm, setBpm] = useState(126);

  const onFile = async (file: File | null) => {
    if (!file || locked) return;
    setBusy(true);
    setErr(null);
    try {
      const buffer = await decodeFile(file);
      const objectUrl = URL.createObjectURL(file);
      const id = `upload-d${deck}-${Date.now()}`;
      registerUploadedTrack({
        id,
        title: file.name.replace(/\.[^.]+$/, "") || `Upload D${deck}`,
        bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : 126,
        objectUrl,
        buffer,
      });
      onUploaded(deck, id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="track-picker-deck">
      <label>
        <span>Deck {deck}</span>
        <select
          value={value}
          disabled={locked || busy}
          aria-label={`Deck ${deck} track`}
          onChange={(e) => onSelect(deck, e.target.value)}
        >
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} · {t.bpm} BPM{t.source === "upload" ? " (upload)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="track-picker-bpm">
        <span>Upload BPM</span>
        <input
          type="number"
          min={60}
          max={200}
          value={bpm}
          disabled={locked || busy}
          onChange={(e) => setBpm(Number(e.target.value))}
        />
      </label>
      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept="audio/*"
        hidden
        disabled={locked || busy}
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={locked || busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? "Decoding…" : "Upload audio"}
      </button>
      {err && <p className="midi-banner warn">{err}</p>}
    </div>
  );
}

export function TrackPickerBar({
  tracks,
  track1,
  track2,
  locked,
  hint,
  onSelect,
  onUploaded,
}: Props) {
  const list = tracks.length ? tracks : getBundledTracks();
  return (
    <div className="track-picker-bar">
      {hint && <p className="track-picker-hint">{hint}</p>}
      <DeckPicker
        deck={1}
        tracks={list}
        value={track1}
        locked={locked}
        onSelect={onSelect}
        onUploaded={onUploaded}
      />
      <DeckPicker
        deck={2}
        tracks={list}
        value={track2}
        locked={locked}
        onSelect={onSelect}
        onUploaded={onUploaded}
      />
    </div>
  );
}
