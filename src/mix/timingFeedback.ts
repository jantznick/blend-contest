/**
 * Scaffolding for mix tutorials: judge how fast/slow a fader/EQ move was.
 * Feed CC samples while the user blends; call judgeCcRamp when they hit the end zone.
 */

export type MotionPoint = { t: number; value: number };

export type RampVerdict = "too-fast" | "too-slow" | "ok" | "incomplete";

export type RampJudgment = {
  verdict: RampVerdict;
  durationMs: number | null;
  tip: string;
};

export type RampOpts = {
  /** Start of the move (e.g. full bass / crossfader left) */
  startZone: (v: number) => boolean;
  /** Target end (e.g. bass killed / crossfader right) */
  endZone: (v: number) => boolean;
  /** Ideal duration window in ms [min, max] for "ok" */
  idealMs: [number, number];
  /** When set with phraseBars, tips say "~2 bars at 124 BPM" instead of seconds */
  phraseBpm?: number;
  phraseBars?: [number, number];
  label?: string;
};

/** Duration in ms for N bars of 4/4 at the given BPM. */
export function idealMsFromBars(bpm: number, bars: number): number {
  return (bars * 4 * 60 * 1000) / bpm;
}

/** Human phrase for a bar-count window at a tempo (e.g. "~2–6 bars at 124 BPM"). */
export function formatPhraseAim(bpm: number, barsLo: number, barsHi: number): string {
  const tempo = Math.round(bpm);
  if (barsLo === barsHi) {
    const unit = barsLo === 1 ? "bar" : "bars";
    return `~${barsLo} ${unit} at ${tempo} BPM`;
  }
  return `~${barsLo}–${barsHi} bars at ${tempo} BPM`;
}

function rampAimPhrase(opts: RampOpts, lo: number, hi: number): string {
  if (opts.phraseBpm != null && opts.phraseBars) {
    return formatPhraseAim(opts.phraseBpm, opts.phraseBars[0], opts.phraseBars[1]);
  }
  return `~${(lo / 1000).toFixed(0)}–${(hi / 1000).toFixed(0)}s`;
}

/**
 * Find first time in startZone, then first later time in endZone; compare duration.
 */
export function judgeCcRamp(points: MotionPoint[], opts: RampOpts): RampJudgment {
  const label = opts.label ?? "that move";
  if (points.length < 2) {
    return {
      verdict: "incomplete",
      durationMs: null,
      tip: `Keep moving — need a clear start and finish for ${label}.`,
    };
  }

  let startT: number | null = null;
  let endT: number | null = null;
  for (const p of points) {
    if (startT == null && opts.startZone(p.value)) startT = p.t;
    if (startT != null && opts.endZone(p.value)) {
      endT = p.t;
      break;
    }
  }

  if (startT == null || endT == null) {
    return {
      verdict: "incomplete",
      durationMs: null,
      tip: `Finish ${label} — park clearly in the start zone, then the end zone.`,
    };
  }

  const durationMs = endT - startT;
  const [lo, hi] = opts.idealMs;
  const aim = rampAimPhrase(opts, lo, hi);
  if (durationMs < lo) {
    return {
      verdict: "too-fast",
      durationMs,
      tip: `${label} took ${(durationMs / 1000).toFixed(1)}s — slow it down (aim ${aim}).`,
    };
  }
  if (durationMs > hi) {
    return {
      verdict: "too-slow",
      durationMs,
      tip: `${label} took ${(durationMs / 1000).toFixed(1)}s — a bit quicker (aim ${aim}).`,
    };
  }
  return {
    verdict: "ok",
    durationMs,
    tip: `${label} timing looks good (${(durationMs / 1000).toFixed(1)}s — ${aim}).`,
  };
}

/** Phrase bar counts for blend coaching (4/4). */
export const BLEND_PHRASE_BARS = {
  /** Soft bass kill while crossfading */
  bassSwap: [2, 6] as [number, number],
  /** Full crossfader travel */
  crossfader: [1, 4] as [number, number],
} as const;

/** Common blend windows at 120 BPM (phrase-ish). Tune per tutorial later. */
export const MIX_WINDOWS = {
  /** Soft bass kill while crossfading — ~2–6 bars @ 120 */
  bassSwap: {
    idealMs: [
      idealMsFromBars(120, BLEND_PHRASE_BARS.bassSwap[0]),
      idealMsFromBars(120, BLEND_PHRASE_BARS.bassSwap[1]),
    ] as [number, number],
  },
  /** Full crossfader travel — ~1–4 bars @ 120 */
  crossfader: {
    idealMs: [
      idealMsFromBars(120, BLEND_PHRASE_BARS.crossfader[0]),
      idealMsFromBars(120, BLEND_PHRASE_BARS.crossfader[1]),
    ] as [number, number],
  },
  /** Filter open into a drop */
  filterOpen: { idealMs: [1500, 6000] as [number, number] },
} as const;

export function blendWindowsForBpm(bpm: number) {
  const [bassLo, bassHi] = BLEND_PHRASE_BARS.bassSwap;
  const [xfLo, xfHi] = BLEND_PHRASE_BARS.crossfader;
  return {
    bassSwap: {
      idealMs: [idealMsFromBars(bpm, bassLo), idealMsFromBars(bpm, bassHi)] as [number, number],
      phraseBars: BLEND_PHRASE_BARS.bassSwap,
    },
    crossfader: {
      idealMs: [idealMsFromBars(bpm, xfLo), idealMsFromBars(bpm, xfHi)] as [number, number],
      phraseBars: BLEND_PHRASE_BARS.crossfader,
    },
  };
}

/** Append a sample; keep a rolling window (default 30s). */
export function pushSample(
  buf: MotionPoint[],
  value: number,
  maxAgeMs = 30_000,
): MotionPoint[] {
  const t = performance.now();
  const next = [...buf, { t, value }];
  const cutoff = t - maxAgeMs;
  return next.filter((p) => p.t >= cutoff);
}

/** Shared MIDI zones for blend / EQ / XF labs (0–127). */
export const MIX_ZONES = {
  center: 64,
  centerTol: 12,
  killMax: 14,
  xfLeftMax: 18,
  xfRightMin: 109,
} as const;

export type BlendSessionSamples = {
  /** Deck 2 LOW (or incoming-deck bass) over the session */
  low: MotionPoint[];
  crossfader: MotionPoint[];
};

export type BlendSessionJudgment = {
  bass: RampJudgment;
  crossfader: RampJudgment;
  /** Both series completed a clear start→end ramp (timing may still be fast/slow). */
  complete: boolean;
};

/**
 * Score a phrase-ish blend: Deck 2 LOW kill + full left→right crossfader travel.
 * Does not grade beatmatching / kick alignment.
 * Pass deck BPM for bar-aware ideal windows and coach copy.
 */
/** MIDI pitch CC → playback rate (matches turntable applyDeckPitch). */
export function pitchCcToRate(cc: number): number {
  return 1 + ((cc - 64) / 64) * 0.08;
}

/** Fractional beat position (0–1) from playhead seconds and effective tempo. */
export function beatPhaseFromPlayhead(playheadSec: number, bpm: number, pitchCc: number): number {
  const beats = (playheadSec * bpm * pitchCcToRate(pitchCc)) / 60;
  return beats - Math.floor(beats);
}

/** Shortest signed phase delta in beats (−0.5…0.5). */
export function wrapBeatPhaseDelta(phaseA: number, phaseB: number): number {
  let d = phaseB - phaseA;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

export type PlayheadSample = {
  t: number;
  playhead1: number;
  playhead2: number;
  pitch1: number;
  pitch2: number;
  bpm1: number;
  bpm2: number;
};

export type KickAlignGrade = "aligned" | "offset" | "drifting";

export type KickAlignJudgment = {
  /** True when both decks ran long enough to compare playhead drift vs BPM scaffold. */
  hasSignal: boolean;
  grade: KickAlignGrade | null;
  offsetBeats: number | null;
  driftBeatsPerSec: number | null;
  tip: string;
  /** Always true — best-effort scaffold, not spectral kick detection. */
  experimental: true;
};

const KICK_ALIGN_MIN_SAMPLES = 4;
const KICK_ALIGN_MIN_WINDOW_MS = 2000;
const KICK_ALIGN_DRIFT_THRESHOLD = 0.025;
const KICK_ALIGN_OFFSET_THRESHOLD = 0.1;

/** Rolling playhead snapshots for beatmatch kick scaffold (default ~10 Hz, 30s window). */
export function pushPlayheadSample(
  buf: PlayheadSample[],
  sample: Omit<PlayheadSample, "t">,
  maxAgeMs = 30_000,
  minIntervalMs = 100,
): PlayheadSample[] {
  const t = performance.now();
  const last = buf[buf.length - 1];
  if (last && t - last.t < minIntervalMs) return buf;
  const next = [...buf, { ...sample, t }];
  const cutoff = t - maxAgeMs;
  return next.filter((p) => p.t >= cutoff);
}

/**
 * Experimental kick-alignment hint: compare deck playhead drift against catalog BPM + pitch CC.
 * Does not analyze audio — only a tempo/phase scaffold for practice feedback.
 */
export function judgeKickAlignment(samples: PlayheadSample[]): KickAlignJudgment {
  const experimental = true as const;
  const silent = (tip: string): KickAlignJudgment => ({
    hasSignal: false,
    grade: null,
    offsetBeats: null,
    driftBeatsPerSec: null,
    tip,
    experimental,
  });

  if (samples.length < KICK_ALIGN_MIN_SAMPLES) {
    return silent("Need more play time with both decks running.");
  }

  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const windowMs = last.t - first.t;
  if (windowMs < KICK_ALIGN_MIN_WINDOW_MS) {
    return silent("Keep both decks playing a bit longer.");
  }

  const beatsAdvanced = (playhead: number, bpm: number, pitch: number, base: number) =>
    ((playhead - base) * bpm * pitchCcToRate(pitch)) / 60;

  const deltaBeats1 = beatsAdvanced(last.playhead1, last.bpm1, last.pitch1, first.playhead1);
  const deltaBeats2 = beatsAdvanced(last.playhead2, last.bpm2, last.pitch2, first.playhead2);
  if (Math.abs(deltaBeats1) < 0.5 || Math.abs(deltaBeats2) < 0.5) {
    return silent("Both decks need to be playing.");
  }

  const beatSlip = deltaBeats2 - deltaBeats1;
  const driftBeatsPerSec = beatSlip / (windowMs / 1000);

  const phase1 = beatPhaseFromPlayhead(last.playhead1, last.bpm1, last.pitch1);
  const phase2 = beatPhaseFromPlayhead(last.playhead2, last.bpm2, last.pitch2);
  const signedOffset = wrapBeatPhaseDelta(phase1, phase2);
  const offsetBeats = Math.abs(signedOffset);

  if (Math.abs(driftBeatsPerSec) > KICK_ALIGN_DRIFT_THRESHOLD) {
    const dir = driftBeatsPerSec > 0 ? "fast" : "slow";
    return {
      hasSignal: true,
      grade: "drifting",
      offsetBeats,
      driftBeatsPerSec,
      tip: `Speeds are drifting — Deck 2 sounds ${dir} vs Deck 1. Nudge Deck 2’s tempo slider until the BPM numbers match.`,
      experimental,
    };
  }

  if (offsetBeats > KICK_ALIGN_OFFSET_THRESHOLD) {
    const effBpm2 = last.bpm2 * pitchCcToRate(last.pitch2);
    const ms = Math.round((offsetBeats * 60_000) / effBpm2);
    const earlyLate = signedOffset > 0 ? "late" : "early";
    return {
      hasSignal: true,
      grade: "offset",
      offsetBeats,
      driftBeatsPerSec,
      tip: `Beats are about ${ms} ms ${earlyLate} — give Deck 2’s platter a small nudge.`,
      experimental,
    };
  }

  return {
    hasSignal: true,
    grade: "aligned",
    offsetBeats,
    driftBeatsPerSec,
    tip: "Beats look lined up for this window — still trust your ears for the final feel.",
    experimental,
  };
}

export function judgeBlendSession(
  samples: BlendSessionSamples,
  bpm?: number,
): BlendSessionJudgment {
  const { center, centerTol, killMax, xfLeftMax, xfRightMin } = MIX_ZONES;
  const windows = bpm != null ? blendWindowsForBpm(bpm) : null;
  const bass = judgeCcRamp(samples.low, {
    startZone: (v) => Math.abs(v - center) <= centerTol,
    endZone: (v) => v <= killMax,
    idealMs: windows?.bassSwap.idealMs ?? MIX_WINDOWS.bassSwap.idealMs,
    phraseBpm: bpm,
    phraseBars: windows?.bassSwap.phraseBars,
    label: "Deck 2 bass (LOW) down",
  });
  const crossfader = judgeCcRamp(samples.crossfader, {
    startZone: (v) => v <= xfLeftMax,
    endZone: (v) => v >= xfRightMin,
    idealMs: windows?.crossfader.idealMs ?? MIX_WINDOWS.crossfader.idealMs,
    phraseBpm: bpm,
    phraseBars: windows?.crossfader.phraseBars,
    label: "Crossfader blend",
  });
  return {
    bass,
    crossfader,
    complete: bass.verdict !== "incomplete" && crossfader.verdict !== "incomplete",
  };
}

/** Named basic transitions graded on Mix Ultra + laptop beds. */
export type TransitionRecipeId =
  | "long-blend"
  | "bass-swap"
  | "filter-open"
  | "xfader-cut"
  | "free";

export const TRANSITION_RECIPES: {
  id: TransitionRecipeId;
  title: string;
  blurb: string;
}[] = [
  {
    id: "free",
    title: "Free",
    blurb: "Switch from Deck 1 to Deck 2 however you like — we score tempo and a clean finish.",
  },
  {
    id: "long-blend",
    title: "Long blend",
    blurb: "Slow fade with volume / crossfader only — leave EQ knobs in the middle.",
  },
  {
    id: "bass-swap",
    title: "Bass swap",
    blurb: "Turn Deck 2’s bass (LOW) down, blend in, then give Deck 2 the bass.",
  },
  {
    id: "filter-open",
    title: "Filter open",
    blurb: "On Deck 2, twist Filter right (thinner), blend in, then return Filter to the middle.",
  },
  {
    id: "xfader-cut",
    title: "Crossfader cut",
    blurb: "Both loud, EQ in the middle — quickly slide the bottom crossfader left → right.",
  },
];

/** Named moves only (for inferring closest pattern in free mode). */
export const NAMED_TRANSITION_RECIPES = TRANSITION_RECIPES.filter((r) => r.id !== "free");

/** Phrase bars for cut / filter-open windows. */
export const TRANSITION_PHRASE_BARS = {
  xfaderCut: [0.25, 2] as [number, number],
  filterOpen: [1, 4] as [number, number],
  volumeHandoff: [2, 8] as [number, number],
} as const;

export type TransitionSessionSamples = {
  crossfader: MotionPoint[];
  deck1Low: MotionPoint[];
  deck2Low: MotionPoint[];
  deck1Mid: MotionPoint[];
  deck2Mid: MotionPoint[];
  deck1High: MotionPoint[];
  deck2High: MotionPoint[];
  deck1Filter: MotionPoint[];
  deck2Filter: MotionPoint[];
  deck1Volume: MotionPoint[];
  deck2Volume: MotionPoint[];
  deck1Pitch: MotionPoint[];
  deck2Pitch: MotionPoint[];
  playheads: PlayheadSample[];
};

export type TransitionDimVerdict =
  | RampVerdict
  | KickAlignGrade
  | "ok"
  | "warn"
  | "miss"
  | "n/a";

export type TransitionDimension = {
  id: string;
  label: string;
  /** 0–100 contribution before weighting. */
  score: number;
  tip: string;
  verdict: TransitionDimVerdict;
};

export type TransitionJudgment = {
  recipe: TransitionRecipeId;
  /** Weighted 0–100. */
  score: number;
  /** Pass at ≥ 70. */
  passed: boolean;
  dimensions: TransitionDimension[];
  summary: string;
};

function lastValue(points: MotionPoint[]): number | null {
  if (points.length === 0) return null;
  return points[points.length - 1]!.value;
}

function anyInZone(points: MotionPoint[], zone: (v: number) => boolean): boolean {
  return points.some((p) => zone(p.value));
}

function fractionInZone(points: MotionPoint[], zone: (v: number) => boolean): number {
  if (points.length === 0) return 0;
  let hit = 0;
  for (const p of points) if (zone(p.value)) hit++;
  return hit / points.length;
}

function rampScore(j: RampJudgment): number {
  if (j.verdict === "ok") return 100;
  if (j.verdict === "too-fast" || j.verdict === "too-slow") return 72;
  return 25;
}

function dim(
  id: string,
  label: string,
  score: number,
  tip: string,
  verdict: TransitionDimVerdict,
): TransitionDimension {
  return { id, label, score: Math.max(0, Math.min(100, Math.round(score))), tip, verdict };
}

/** Effective tempo from catalog BPM + pitch CC (1.0 = original). */
export function effectiveBpm(catalogBpm: number, pitchCc: number): number {
  return catalogBpm * pitchCcToRate(pitchCc);
}

/**
 * How close two decks’ effective tempos are (catalog BPM × pitch CC).
 * SYNC is not graded — only the tempo fader result.
 */
export function judgeTempoMatch(
  bpm1: number,
  bpm2: number,
  pitch1Points: MotionPoint[],
  pitch2Points: MotionPoint[],
): TransitionDimension {
  const p1 = lastValue(pitch1Points) ?? MIX_ZONES.center;
  const p2 = lastValue(pitch2Points) ?? MIX_ZONES.center;
  const e1 = effectiveBpm(bpm1, p1);
  const e2 = effectiveBpm(bpm2, p2);
  const delta = Math.abs(e1 - e2);
  if (delta <= 0.35) {
    return dim(
      "tempo",
      "Tempo match",
      100,
      `Effective tempos within ${delta.toFixed(2)} BPM — leave SYNC off; this is the tempo fader job.`,
      "ok",
    );
  }
  if (delta <= 1.2) {
    return dim(
      "tempo",
      "Tempo match",
      70,
      `~${delta.toFixed(1)} BPM apart after pitch — nudge Deck 2’s tempo fader a little closer.`,
      "warn",
    );
  }
  return dim(
    "tempo",
    "Tempo match",
    35,
    `~${delta.toFixed(1)} BPM apart — match speeds with the tempo fader before the blend (SYNC stays off in drills).`,
    "miss",
  );
}

/** Channel fader “both decks in the room” threshold (0–127). */
const CHANNEL_AUDIBLE_MIN = 48;

function sampleAt(
  points: MotionPoint[],
  index: number,
  fallback: number,
): number {
  if (points.length === 0) return fallback;
  return points[Math.min(index, points.length - 1)]!.value;
}

function judgeBassMud(
  d1Low: MotionPoint[],
  d2Low: MotionPoint[],
  xf: MotionPoint[],
  vol1: MotionPoint[] = [],
  vol2: MotionPoint[] = [],
): TransitionDimension {
  const { center, centerTol, killMax, xfLeftMax, xfRightMin } = MIX_ZONES;
  const hasXf = xf.length >= 2;
  const hasVol = vol1.length >= 2 && vol2.length >= 2;
  if (d1Low.length < 2 || d2Low.length < 2 || (!hasXf && !hasVol)) {
    return dim(
      "bass",
      "Bass clarity",
      40,
      "Need more bass-knob (LOW) and volume/crossfader moves to judge whether two basslines clashed.",
      "incomplete",
    );
  }

  let muddy = 0;
  let overlap = 0;
  const n = Math.max(
    Math.min(d1Low.length, d2Low.length),
    hasXf ? xf.length : 0,
    hasVol ? Math.min(vol1.length, vol2.length) : 0,
  );
  for (let i = 0; i < n; i++) {
    const xfV = sampleAt(xf, i, MIX_ZONES.center);
    const v1 = sampleAt(vol1, i, 127);
    const v2 = sampleAt(vol2, i, 127);
    // Both decks in the room: XF not hard-parked on one side (or XF missing),
    // and — when channel faders were recorded — both audible. Covers XF blends
    // and line-fader mixes with XF centered.
    const xfAllowsBoth = !hasXf || (xfV > xfLeftMax && xfV < xfRightMin);
    const channelsAllowBoth =
      !hasVol || (v1 >= CHANNEL_AUDIBLE_MIN && v2 >= CHANNEL_AUDIBLE_MIN);
    if (!(hasXf || hasVol) || !xfAllowsBoth || !channelsAllowBoth) continue;
    overlap++;
    const l1 = d1Low[Math.min(i, d1Low.length - 1)]!.value;
    const l2 = d2Low[Math.min(i, d2Low.length - 1)]!.value;
    const bothFull =
      Math.abs(l1 - center) <= centerTol + 8 && Math.abs(l2 - center) <= centerTol + 8;
    if (bothFull) muddy++;
  }

  if (overlap < 3) {
    return dim(
      "bass",
      "Bass clarity",
      55,
      "Both songs weren’t overlapping long enough to judge bass — keep both audible a bit longer if you want a bass tip.",
      "incomplete",
    );
  }

  const muddyFrac = muddy / overlap;
  if (muddyFrac > 0.45) {
    return dim(
      "bass",
      "Bass clarity",
      30,
      "Both bass knobs (LOW) sat in the middle while both songs played — turn one bass left so they don’t clash.",
      "miss",
    );
  }
  if (muddyFrac > 0.2) {
    return dim(
      "bass",
      "Bass clarity",
      65,
      "Some double-bass clash — keep one LOW (bass) knob turned left for most of the blend.",
      "warn",
    );
  }

  const d2Killed = anyInZone(d2Low, (v) => v <= killMax);
  if (d2Killed) {
    return dim(
      "bass",
      "Bass clarity",
      100,
      "Deck 2’s bass (LOW) was turned down during the overlap — one clean bassline.",
      "ok",
    );
  }
  return dim(
    "bass",
    "Bass clarity",
    85,
    "No heavy double-bass clash detected on this pass.",
    "ok",
  );
}

function judgeEqFlatness(
  mids: MotionPoint[],
  highs: MotionPoint[],
  label: string,
): TransitionDimension {
  const { center, centerTol } = MIX_ZONES;
  const pts = [...mids, ...highs];
  if (pts.length < 4) {
    return dim("eq-flat", label, 60, "Not enough MID/HIGH samples — leave mid & treble knobs in the middle for basic mixes.", "incomplete");
  }
  const near = fractionInZone(pts, (v) => Math.abs(v - center) <= centerTol + 10);
  if (near >= 0.75) {
    return dim("eq-flat", label, 100, "MID/HIGH stayed in the middle — good for a basic switch.", "ok");
  }
  if (near >= 0.45) {
    return dim("eq-flat", label, 70, "Some MID/HIGH moves — fine if intentional; put them back in the middle after.", "warn");
  }
  return dim(
    "eq-flat",
    label,
    45,
    "MID/HIGH moved a lot — basic blends usually leave mid & treble knobs in the middle.",
    "warn",
  );
}

function judgeVolumeHandoff(
  vol1: MotionPoint[],
  vol2: MotionPoint[],
  bpm?: number,
): RampJudgment {
  const up = (v: number) => v >= 90;
  const down = (v: number) => v <= 24;
  const bars = TRANSITION_PHRASE_BARS.volumeHandoff;
  const idealMs =
    bpm != null
      ? ([idealMsFromBars(bpm, bars[0]), idealMsFromBars(bpm, bars[1])] as [number, number])
      : ([idealMsFromBars(120, bars[0]), idealMsFromBars(120, bars[1])] as [number, number]);

  // Prefer Deck 2 up then Deck 1 down as a proxy for channel-fader long blend.
  const incomingUp = judgeCcRamp(vol2, {
    startZone: down,
    endZone: up,
    idealMs,
    phraseBpm: bpm,
    phraseBars: bars,
    label: "Deck 2 volume up",
  });
  const outgoingDown = judgeCcRamp(vol1, {
    startZone: up,
    endZone: down,
    idealMs,
    phraseBpm: bpm,
    phraseBars: bars,
    label: "Deck 1 volume down",
  });
  if (incomingUp.verdict !== "incomplete" && outgoingDown.verdict !== "incomplete") {
    const worse =
      rampScore(incomingUp) <= rampScore(outgoingDown) ? incomingUp : outgoingDown;
    return {
      ...worse,
      tip: `Volume faders: ${incomingUp.tip} · ${outgoingDown.tip}`,
    };
  }
  if (incomingUp.verdict !== "incomplete") return incomingUp;
  return outgoingDown;
}

function kickDim(samples: PlayheadSample[]): TransitionDimension {
  const k = judgeKickAlignment(samples);
  if (!k.hasSignal || k.grade == null) {
    return dim("kick", "Beat match", 50, k.tip, "incomplete");
  }
  if (k.grade === "aligned") {
    return dim("kick", "Beat match", 100, k.tip, "aligned");
  }
  if (k.grade === "offset") {
    return dim("kick", "Beat match", 55, k.tip, "offset");
  }
  return dim("kick", "Beat match", 40, k.tip, "drifting");
}

function weightedScore(dims: { dim: TransitionDimension; weight: number }[]): number {
  let sum = 0;
  let w = 0;
  for (const { dim: d, weight } of dims) {
    if (d.verdict === "n/a") continue;
    sum += d.score * weight;
    w += weight;
  }
  if (w <= 0) return 0;
  return Math.round(sum / w);
}

function summarize(recipe: TransitionRecipeId, score: number, passed: boolean): string {
  if (recipe === "free") {
    if (passed && score >= 90) return `Free mix: excellent switch (${score}).`;
    if (passed) return `Free mix: solid (${score}) — check the tips for polish.`;
    return `Free mix: ${score}/100 — cleaner switch or closer tempos (pass ≥ 70).`;
  }
  const name = TRANSITION_RECIPES.find((r) => r.id === recipe)?.title ?? "Transition";
  if (passed && score >= 90) return `${name}: excellent switch (${score}).`;
  if (passed) return `${name}: solid pass (${score}) — check the tips for polish.`;
  return `${name}: ${score}/100 — fix the miss/warn lines and try again (pass ≥ 70).`;
}

function buildHandoffDim(
  samples: TransitionSessionSamples,
  phraseBpm: number,
  recipe: TransitionRecipeId,
  windows: ReturnType<typeof blendWindowsForBpm>,
): TransitionDimension {
  const { xfLeftMax, xfRightMin } = MIX_ZONES;
  const xfRamp = judgeCcRamp(samples.crossfader, {
    startZone: (v) => v <= xfLeftMax,
    endZone: (v) => v >= xfRightMin,
    idealMs:
      recipe === "xfader-cut"
        ? ([
            idealMsFromBars(phraseBpm, TRANSITION_PHRASE_BARS.xfaderCut[0]),
            idealMsFromBars(phraseBpm, TRANSITION_PHRASE_BARS.xfaderCut[1]),
          ] as [number, number])
        : windows.crossfader.idealMs,
    phraseBpm,
    phraseBars:
      recipe === "xfader-cut" ? TRANSITION_PHRASE_BARS.xfaderCut : windows.crossfader.phraseBars,
    label: recipe === "xfader-cut" ? "Crossfader cut" : "Crossfader blend",
  });

  const volHandoff = judgeVolumeHandoff(samples.deck1Volume, samples.deck2Volume, phraseBpm);
  const handoffFromXf = rampScore(xfRamp);
  const handoffFromVol = rampScore(volHandoff);
  // Crossfader cut must use XF. Every other recipe accepts channel-fader handoffs
  // (XF parked center, Deck 2 up / Deck 1 down) when that scores better.
  const allowVol = recipe !== "xfader-cut";
  const useVol = allowVol && handoffFromVol > handoffFromXf;
  const handoffJudgment = useVol ? volHandoff : xfRamp;
  return dim(
    "handoff",
    useVol ? "Volume-fader switch" : "Crossfader switch",
    rampScore(handoffJudgment),
    handoffJudgment.tip,
    handoffJudgment.verdict,
  );
}

/**
 * Grade a basic same-speed transition from recorded Mix Ultra CCs + playhead scaffold.
 * Does not analyze Neural Mix stems or djay SYNC audio — those stay out of the laptop turntable.
 */
export function judgeBasicTransition(
  recipe: TransitionRecipeId,
  samples: TransitionSessionSamples,
  opts?: { bpm1?: number; bpm2?: number },
): TransitionJudgment {
  if (recipe === "free") {
    return judgeFreeTransition(samples, opts);
  }

  const { center, centerTol, killMax } = MIX_ZONES;
  const bpm1 = opts?.bpm1 ?? 120;
  const bpm2 = opts?.bpm2 ?? bpm1;
  const phraseBpm = Math.round((bpm1 + bpm2) / 2);
  const windows = blendWindowsForBpm(phraseBpm);

  const handoff = buildHandoffDim(samples, phraseBpm, recipe, windows);
  const tempo = judgeTempoMatch(bpm1, bpm2, samples.deck1Pitch, samples.deck2Pitch);
  const kick = kickDim(samples.playheads);
  const eqFlat = judgeEqFlatness(
    [...samples.deck1Mid, ...samples.deck2Mid],
    [...samples.deck1High, ...samples.deck2High],
    "MID / HIGH knobs",
  );

  const d2Bass = judgeCcRamp(samples.deck2Low, {
    startZone: (v) => Math.abs(v - center) <= centerTol,
    endZone: (v) => v <= killMax,
    idealMs: windows.bassSwap.idealMs,
    phraseBpm,
    phraseBars: windows.bassSwap.phraseBars,
    label: "Deck 2 bass (LOW) down",
  });
  const d1Bass = judgeCcRamp(samples.deck1Low, {
    startZone: (v) => Math.abs(v - center) <= centerTol,
    endZone: (v) => v <= killMax,
    idealMs: windows.bassSwap.idealMs,
    phraseBpm,
    phraseBars: windows.bassSwap.phraseBars,
    label: "Deck 1 bass (LOW) down",
  });
  const bassMud = judgeBassMud(
    samples.deck1Low,
    samples.deck2Low,
    samples.crossfader,
    samples.deck1Volume,
    samples.deck2Volume,
  );

  const filterOpen = judgeCcRamp(samples.deck2Filter, {
    startZone: (v) => v >= 88,
    endZone: (v) => Math.abs(v - center) <= centerTol,
    idealMs: [
      idealMsFromBars(phraseBpm, TRANSITION_PHRASE_BARS.filterOpen[0]),
      idealMsFromBars(phraseBpm, TRANSITION_PHRASE_BARS.filterOpen[1]),
    ],
    phraseBpm,
    phraseBars: TRANSITION_PHRASE_BARS.filterOpen,
    label: "Deck 2 Filter open",
  });

  const weighted: { dim: TransitionDimension; weight: number }[] = [];

  if (recipe === "long-blend") {
    const lowsNear = fractionInZone(
      [...samples.deck1Low, ...samples.deck2Low],
      (v) => Math.abs(v - center) <= centerTol + 14,
    );
    const eqDiscipline = dim(
      "eq-discipline",
      "EQ left alone",
      lowsNear >= 0.7 ? 100 : lowsNear >= 0.4 ? 65 : 35,
      lowsNear >= 0.7
        ? "Bass knobs (LOW) stayed in the middle — good for a volume-only long blend."
        : "Long blend is volume/crossfader only — leave LOW knobs in the middle (use Bass swap for bass moves).",
      lowsNear >= 0.7 ? "ok" : lowsNear >= 0.4 ? "warn" : "miss",
    );
    weighted.push(
      { dim: handoff, weight: 0.4 },
      { dim: eqDiscipline, weight: 0.2 },
      { dim: eqFlat, weight: 0.1 },
      { dim: tempo, weight: 0.15 },
      { dim: kick, weight: 0.15 },
    );
  } else if (recipe === "bass-swap") {
    const bassSwapDim = dim(
      "bass-swap",
      "Bass swap",
      Math.round((rampScore(d2Bass) * 0.55 + rampScore(d1Bass) * 0.25 + bassMud.score * 0.2)),
      `Incoming: ${d2Bass.tip} Outgoing: ${d1Bass.tip}`,
      d2Bass.verdict === "incomplete" || d1Bass.verdict === "incomplete"
        ? "incomplete"
        : d2Bass.verdict === "ok"
          ? "ok"
          : d2Bass.verdict,
    );
    weighted.push(
      { dim: handoff, weight: 0.3 },
      { dim: bassSwapDim, weight: 0.35 },
      { dim: eqFlat, weight: 0.1 },
      { dim: tempo, weight: 0.125 },
      { dim: kick, weight: 0.125 },
    );
  } else if (recipe === "filter-open") {
    const filterDim = dim(
      "filter",
      "Filter open",
      rampScore(filterOpen),
      filterOpen.tip,
      filterOpen.verdict,
    );
    const bassCarve = dim(
      "bass-carve",
      "Deck 2 bass (LOW) down",
      rampScore(d2Bass),
      d2Bass.tip,
      d2Bass.verdict,
    );
    weighted.push(
      { dim: handoff, weight: 0.25 },
      { dim: filterDim, weight: 0.35 },
      { dim: bassCarve, weight: 0.15 },
      { dim: tempo, weight: 0.125 },
      { dim: kick, weight: 0.125 },
    );
  } else {
    const { xfLeftMax, xfRightMin } = MIX_ZONES;
    const cutXfRamp = judgeCcRamp(samples.crossfader, {
      startZone: (v) => v <= xfLeftMax,
      endZone: (v) => v >= xfRightMin,
      idealMs: [
        idealMsFromBars(phraseBpm, TRANSITION_PHRASE_BARS.xfaderCut[0]),
        idealMsFromBars(phraseBpm, TRANSITION_PHRASE_BARS.xfaderCut[1]),
      ],
      phraseBpm,
      phraseBars: TRANSITION_PHRASE_BARS.xfaderCut,
      label: "Crossfader cut",
    });
    const cutSpeed =
      cutXfRamp.verdict === "too-slow"
        ? dim("cut-speed", "Cut speed", 45, cutXfRamp.tip, "too-slow")
        : cutXfRamp.verdict === "too-fast"
          ? dim(
              "cut-speed",
              "Cut speed",
              90,
              "Snap cut logged — fine for a throw; count beat 1 so it isn’t early.",
              "ok",
            )
          : dim("cut-speed", "Cut speed", rampScore(cutXfRamp), cutXfRamp.tip, cutXfRamp.verdict);
    const flatEq = dim(
      "cut-eq",
      "EQ left alone for cut",
      Math.round((eqFlat.score + (bassMud.score >= 70 ? 40 : bassMud.score)) / 1.4),
      "Cuts usually leave EQ knobs in the middle — both decks loud, then slide the crossfader.",
      eqFlat.verdict,
    );
    weighted.push(
      { dim: handoff, weight: 0.35 },
      { dim: cutSpeed, weight: 0.25 },
      { dim: flatEq, weight: 0.15 },
      { dim: tempo, weight: 0.125 },
      { dim: kick, weight: 0.125 },
    );
  }

  const dimensions = weighted.map((w) => w.dim);
  const score = weightedScore(weighted);
  const passed = score >= 70 && handoff.verdict !== "incomplete";
  return {
    recipe,
    score,
    passed,
    dimensions,
    summary: summarize(recipe, score, passed),
  };
}

const MIN_TRANSITION_SAMPLES = 4;
const MIN_TRANSITION_WINDOW_MS = 2500;

function incompleteTransitionJudgment(
  recipe: TransitionRecipeId,
  tip: string,
): TransitionJudgment {
  return {
    recipe,
    score: 0,
    passed: false,
    dimensions: [
      dim("session", "Recording", 0, tip, "incomplete"),
    ],
    summary: summarize(recipe, 0, false),
  };
}

/**
 * Free mode: holistic blend quality + which named move the motion closest matches.
 */
function sessionMotionSeries(samples: TransitionSessionSamples): MotionPoint[] {
  const series = [
    samples.crossfader,
    samples.deck1Volume,
    samples.deck2Volume,
    samples.deck1Low,
    samples.deck2Low,
  ];
  let best = samples.crossfader;
  for (const s of series) {
    if (s.length > best.length) best = s;
  }
  return best;
}

export function judgeFreeTransition(
  samples: TransitionSessionSamples,
  opts?: { bpm1?: number; bpm2?: number },
): TransitionJudgment {
  const recipe = "free" as const;
  const motion = sessionMotionSeries(samples);
  if (motion.length < MIN_TRANSITION_SAMPLES) {
    return incompleteTransitionJudgment(
      recipe,
      "Need more motion — hit Go, blend with the crossfader or volume faders, then Done (at least a few seconds).",
    );
  }
  const firstT = motion[0]?.t ?? 0;
  const lastT = motion[motion.length - 1]?.t ?? firstT;
  if (lastT - firstT < MIN_TRANSITION_WINDOW_MS) {
    return incompleteTransitionJudgment(
      recipe,
      "That blend was too short — give the switch a few seconds before Done.",
    );
  }

  const bpm1 = opts?.bpm1 ?? 120;
  const bpm2 = opts?.bpm2 ?? bpm1;
  const phraseBpm = Math.round((bpm1 + bpm2) / 2);
  const windows = blendWindowsForBpm(phraseBpm);

  const handoffBlend = buildHandoffDim(samples, phraseBpm, "long-blend", windows);
  const handoffCut = buildHandoffDim(samples, phraseBpm, "xfader-cut", windows);
  const handoff = handoffBlend.score >= handoffCut.score ? handoffBlend : handoffCut;

  const tempo = judgeTempoMatch(bpm1, bpm2, samples.deck1Pitch, samples.deck2Pitch);
  const kick = kickDim(samples.playheads);
  const bassMud = judgeBassMud(
    samples.deck1Low,
    samples.deck2Low,
    samples.crossfader,
    samples.deck1Volume,
    samples.deck2Volume,
  );
  const eqFlat = judgeEqFlatness(
    [...samples.deck1Mid, ...samples.deck2Mid],
    [...samples.deck1High, ...samples.deck2High],
    "MID / HIGH",
  );

  const inferred = NAMED_TRANSITION_RECIPES.map((r) => ({
    id: r.id,
    judgment: judgeBasicTransition(r.id, samples, opts),
  })).reduce((best, cur) => (cur.judgment.score > best.judgment.score ? cur : best));

  const inferredTitle =
    TRANSITION_RECIPES.find((r) => r.id === inferred.id)?.title ?? inferred.id;

  const weighted: { dim: TransitionDimension; weight: number }[] = [
    { dim: handoff, weight: 0.3 },
    { dim: bassMud, weight: 0.2 },
    { dim: tempo, weight: 0.15 },
    { dim: kick, weight: 0.125 },
    { dim: eqFlat, weight: 0.1 },
    {
      dim: dim(
        "inferred",
        "Closest style",
        inferred.judgment.score,
        `Motion best matches ${inferredTitle} (${inferred.judgment.score}/100 for that pattern).`,
        inferred.judgment.score >= 70 ? "ok" : "warn",
      ),
      weight: 0.075,
    },
  ];

  const dimensions = weighted.map((w) => w.dim);
  const score = weightedScore(weighted);
  const passed = score >= 70 && handoff.verdict !== "incomplete";

  return {
    recipe,
    score,
    passed,
    dimensions,
    summary: passed
      ? `Free mix: ${score} — closest style: ${inferredTitle}.`
      : summarize(recipe, score, false),
  };
}
