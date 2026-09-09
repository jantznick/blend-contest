/** Catalog of contest / practice beds. Drop files in /public/tracks/ and list them here. */

export type TrackId = string;

export type TrackSource = "bundled" | "upload";

export type TrackInfo = {
  id: TrackId;
  title: string;
  bpm: number;
  source: TrackSource;
  /** Path under public/, e.g. /tracks/house.mp3 — omit to use synth fallback */
  file?: string;
  /** Synth style used only when file is missing */
  synth?: "house" | "deep" | "breaks" | "tech";
};

/**
 * Add your own loops: put mp3/wav/ogg in public/tracks/, then add a row here.
 * Example: { id: "my-loop", title: "My loop", bpm: 124, source: "bundled", file: "/tracks/my-loop.mp3" }
 */
export const TRACK_CATALOG: TrackInfo[] = [
  { id: "house", title: "House", bpm: 124, source: "bundled", file: "/tracks/house.mp3", synth: "house" },
  { id: "deep", title: "Deep", bpm: 118, source: "bundled", file: "/tracks/deep.mp3", synth: "deep" },
  { id: "breaks", title: "Breaks", bpm: 138, source: "bundled", file: "/tracks/breaks.mp3", synth: "breaks" },
  { id: "tech", title: "Tech", bpm: 128, source: "bundled", file: "/tracks/tech.mp3", synth: "tech" },
  { id: "blend-a", title: "Blend A", bpm: 126, source: "bundled", file: "/tracks/blend-a.mp3", synth: "house" },
  { id: "blend-b", title: "Blend B", bpm: 128, source: "bundled", file: "/tracks/blend-b.mp3", synth: "tech" },
];

const bufferCache = new Map<string, AudioBuffer>();
const catalogListeners = new Set<() => void>();

function notifyCatalog() {
  for (const fn of catalogListeners) fn();
}

export function subscribeCatalog(fn: () => void): () => void {
  catalogListeners.add(fn);
  return () => catalogListeners.delete(fn);
}

export function getTrackCatalog(): TrackInfo[] {
  return TRACK_CATALOG;
}

export function getBundledTracks(): TrackInfo[] {
  return TRACK_CATALOG.filter((t) => t.source === "bundled");
}

export function trackById(id: TrackId): TrackInfo {
  return getTrackCatalog().find((t) => t.id === id) ?? TRACK_CATALOG[0]!;
}

export function getCachedBuffer(id: TrackId): AudioBuffer | undefined {
  return bufferCache.get(id);
}

export function cacheTrackBuffer(id: TrackId, buffer: AudioBuffer) {
  bufferCache.set(id, buffer);
}

/** Register a user-uploaded file as a catalog track (blob URL + decoded buffer). */
export function registerUploadedTrack(opts: {
  id: TrackId;
  title: string;
  bpm: number;
  objectUrl: string;
  buffer: AudioBuffer;
}): TrackInfo {
  const existing = TRACK_CATALOG.findIndex((t) => t.id === opts.id);
  const row: TrackInfo = {
    id: opts.id,
    title: opts.title,
    bpm: opts.bpm,
    source: "upload",
    file: opts.objectUrl,
  };
  if (existing >= 0) TRACK_CATALOG[existing] = row;
  else TRACK_CATALOG.push(row);
  cacheTrackBuffer(opts.id, opts.buffer);
  notifyCatalog();
  return row;
}

export function formatTrackDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
