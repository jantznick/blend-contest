/** Dual-deck practice engine. Prefers files in /public/tracks/, synth fallback if missing. */

import {
  TRACK_CATALOG,
  getCachedBuffer,
  trackById,
  type TrackId,
  type TrackInfo,
} from "./tracks";
import { computePeaks } from "./waveform";

export type { TrackId, TrackInfo };
export { TRACK_CATALOG };

type SynthStyle = "house" | "deep" | "breaks" | "tech";

type Channel = {
  filter: BiquadFilterNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  gain: GainNode;
  source: AudioBufferSourceNode | null;
  playing: boolean;
  trackId: TrackId;
  buffer: AudioBuffer;
  /** Seconds into buffer when current source started */
  startOffset: number;
  /** ctx.currentTime when source started */
  startedAt: number;
  /** Current playback rate (may be momentarily nudged by jog / FX) */
  playbackRate: number;
  /** Tempo fader rate — restored after jog / stop / FX release */
  pitchRate: number;
  hotCues: (number | null)[];
  /** Active auto-loop length in beats, or null for full-buffer loop */
  loopBeats: number | null;
  loopStartSec: number;
  loopLenSec: number;
  /** NEURAL stem-style EQ kills */
  neuralMutes: boolean[];
};

export type TurntableEngine = {
  ctx: AudioContext;
  master: GainNode;
  deck1: Channel;
  deck2: Channel;
};

function fillSynth(buffer: AudioBuffer, style: SynthStyle, bpm: number) {
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const beat = 60 / bpm;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const beatPos = (t % beat) / beat;
    const barPos = (t % (beat * 4)) / (beat * 4);

    let kickEnv = Math.exp(-beatPos * 18);
    if (style === "breaks") {
      const hit = beatPos < 0.08 || (barPos > 0.5 && barPos < 0.52);
      kickEnv = hit ? Math.exp(-((t % (beat * 0.5)) / (beat * 0.5)) * 16) : 0;
    }
    const kickF = style === "deep" ? 48 : style === "tech" ? 60 : 55;
    const kick = Math.sin(2 * Math.PI * (kickF + (1 - beatPos) * 35) * t) * kickEnv * 0.55;

    const bassFreq =
      style === "deep"
        ? barPos < 0.5
          ? 41
          : 55
        : style === "tech"
          ? barPos < 0.5
            ? 55
            : 65.4
          : barPos < 0.5
            ? 55
            : 73.4;
    const bass =
      Math.sin(2 * Math.PI * bassFreq * t) * (style === "deep" ? 0.34 : 0.26) +
      Math.sin(2 * Math.PI * bassFreq * 2 * t) * 0.07;

    const off = ((t + beat * 0.5) % beat) / beat;
    const stabEnv = style === "house" && off < 0.12 ? Math.exp(-off * 40) : 0;
    const stab = Math.sin(2 * Math.PI * 220 * t) * stabEnv * 0.2;

    let hatEnv = 0;
    if (style === "tech") {
      hatEnv = beatPos > 0.48 && beatPos < 0.56 ? 1 - (beatPos - 0.48) / 0.08 : 0;
    } else if (style === "breaks") {
      hatEnv = beatPos > 0.25 && beatPos < 0.32 ? 0.9 : beatPos > 0.75 && beatPos < 0.82 ? 0.7 : 0;
    } else {
      hatEnv = beatPos > 0.5 && beatPos < 0.58 ? 1 - (beatPos - 0.5) / 0.08 : 0;
    }
    const hat = (Math.random() * 2 - 1) * hatEnv * 0.18;
    const air = (Math.random() * 2 - 1) * 0.035 + Math.sin(2 * Math.PI * 880 * t) * 0.03;
    const s = kick + bass + stab + hat + air;
    L[i] = s;
    R[i] = s * 0.96;
  }
}

function synthBuffer(ctx: AudioContext, style: SynthStyle, bpm: number): AudioBuffer {
  const secs = (8 * 60) / bpm;
  const buffer = ctx.createBuffer(2, Math.floor(ctx.sampleRate * secs), ctx.sampleRate);
  fillSynth(buffer, style, bpm);
  return buffer;
}

async function loadTrackBuffer(ctx: AudioContext, track: TrackInfo): Promise<AudioBuffer> {
  const cached = getCachedBuffer(track.id);
  if (cached) return cached;

  if (track.file) {
    try {
      const res = await fetch(track.file);
      if (res.ok) {
        const raw = await res.arrayBuffer();
        return await ctx.decodeAudioData(raw.slice(0));
      }
    } catch {
      /* fall through to synth */
    }
  }
  return synthBuffer(ctx, track.synth ?? "house", track.bpm);
}

function midiToFilter(filter: BiquadFilterNode, cc: number) {
  const spread = cc - 64;
  if (Math.abs(spread) <= 4) {
    filter.type = "allpass";
    filter.frequency.value = 1000;
    filter.Q.value = 0.7;
    return;
  }
  if (spread < 0) {
    const amount = Math.min(1, Math.abs(spread) / 60);
    filter.type = "lowpass";
    filter.frequency.value = 18000 * Math.pow(0.04, amount);
    filter.Q.value = 0.7 + amount * 0.6;
  } else {
    const amount = Math.min(1, spread / 60);
    filter.type = "highpass";
    filter.frequency.value = 40 * Math.pow(80, amount);
    filter.Q.value = 0.7 + amount * 0.5;
  }
}

function midiToLow(low: BiquadFilterNode, cc: number) {
  low.type = "lowshelf";
  low.frequency.value = 180;
  low.gain.value = cc <= 8 ? -48 : ((cc - 64) / 64) * 18;
}

function midiToMid(mid: BiquadFilterNode, cc: number) {
  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = 0.9;
  mid.gain.value = cc <= 8 ? -36 : ((cc - 64) / 64) * 14;
}

function midiToHigh(high: BiquadFilterNode, cc: number) {
  high.type = "highshelf";
  high.frequency.value = 6000;
  high.gain.value = cc <= 8 ? -36 : ((cc - 64) / 64) * 14;
}

function wireChannel(ctx: AudioContext): Omit<Channel, "trackId" | "buffer"> {
  const filter = ctx.createBiquadFilter();
  filter.type = "allpass";
  const low = ctx.createBiquadFilter();
  const mid = ctx.createBiquadFilter();
  const high = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  gain.gain.value = 0.7;
  filter.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(gain);
  midiToLow(low, 64);
  midiToMid(mid, 64);
  midiToHigh(high, 64);
  return {
    filter,
    low,
    mid,
    high,
    gain,
    source: null,
    playing: false,
    startOffset: 0,
    startedAt: 0,
    playbackRate: 1,
    pitchRate: 1,
    hotCues: Array(8).fill(null),
    loopBeats: null,
    loopStartSec: 0,
    loopLenSec: 0,
    neuralMutes: Array(8).fill(false),
  };
}

export async function createTurntable(): Promise<TurntableEngine> {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.75;
  master.connect(ctx.destination);

  const d1 = wireChannel(ctx);
  const d2 = wireChannel(ctx);
  d1.gain.connect(master);
  d2.gain.connect(master);

  const t1 = trackById("house");
  const t2 = trackById("deep");
  const deck1: Channel = {
    ...d1,
    trackId: t1.id,
    buffer: await loadTrackBuffer(ctx, t1),
  };
  const deck2: Channel = {
    ...d2,
    trackId: t2.id,
    buffer: await loadTrackBuffer(ctx, t2),
  };

  const engine = { ctx, master, deck1, deck2 };
  applyCrossfader(engine, 32, 100, 100);
  return engine;
}

function stopChannel(ch: Channel) {
  if (ch.playing && ch.source) {
    ch.startOffset = getPlayhead(ch);
  }
  try {
    ch.source?.stop();
  } catch {
    /* */
  }
  ch.source = null;
  ch.playing = false;
  ch.playbackRate = ch.pitchRate;
}

function getPlayhead(ch: Channel): number {
  const dur = ch.buffer.duration || 1;
  if (!ch.playing) return ((ch.startOffset % dur) + dur) % dur;
  const elapsed = (ch.source!.context.currentTime - ch.startedAt) * ch.playbackRate;
  if (ch.loopBeats != null && ch.loopLenSec > 0) {
    const rel = ((elapsed % ch.loopLenSec) + ch.loopLenSec) % ch.loopLenSec;
    return ch.loopStartSec + rel;
  }
  return ((ch.startOffset + elapsed) % dur + dur) % dur;
}

function applyLoopPoints(source: AudioBufferSourceNode, ch: Channel) {
  const dur = ch.buffer.duration || 1;
  if (ch.loopBeats != null && ch.loopLenSec > 0) {
    source.loop = true;
    source.loopStart = ch.loopStartSec;
    source.loopEnd = Math.min(dur, ch.loopStartSec + ch.loopLenSec);
  } else {
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = dur;
  }
}

function startChannel(engine: TurntableEngine, ch: Channel, offset?: number) {
  stopChannel(ch);
  const off = offset ?? ch.startOffset;
  const dur = ch.buffer.duration || 1;
  let startAt = ((off % dur) + dur) % dur;
  if (ch.loopBeats != null && ch.loopLenSec > 0) {
    if (startAt < ch.loopStartSec || startAt >= ch.loopStartSec + ch.loopLenSec) {
      startAt = ch.loopStartSec;
    }
  }
  const source = engine.ctx.createBufferSource();
  source.buffer = ch.buffer;
  applyLoopPoints(source, ch);
  source.playbackRate.value = ch.pitchRate;
  source.connect(ch.filter);
  source.start(0, startAt);
  ch.source = source;
  ch.playing = true;
  ch.startOffset = startAt;
  ch.startedAt = engine.ctx.currentTime;
  ch.playbackRate = ch.pitchRate;
}

export function getHotCues(engine: TurntableEngine, deck: 1 | 2): (number | null)[] {
  return (deck === 1 ? engine.deck1 : engine.deck2).hotCues.slice();
}

export function getDeckPlayhead(engine: TurntableEngine, deck: 1 | 2): number {
  return getPlayhead(deck === 1 ? engine.deck1 : engine.deck2);
}

export function getDeckDuration(engine: TurntableEngine, deck: 1 | 2): number {
  return (deck === 1 ? engine.deck1 : engine.deck2).buffer.duration || 1;
}

export function getDeckPeaks(
  engine: TurntableEngine,
  deck: 1 | 2,
  bars = 256,
): Float32Array {
  return computePeaks((deck === 1 ? engine.deck1 : engine.deck2).buffer, bars);
}

/** Hot cue: empty pad sets; lit pad jumps. clear=true erases. */
export function handlePad(
  engine: TurntableEngine,
  deck: 1 | 2,
  pad: number,
  clear: boolean,
): (number | null)[] {
  const ch = deck === 1 ? engine.deck1 : engine.deck2;
  if (clear) {
    ch.hotCues[pad] = null;
    return ch.hotCues.slice();
  }
  const existing = ch.hotCues[pad];
  if (existing == null) {
    ch.hotCues[pad] = getPlayhead(ch);
  } else {
    startChannel(engine, ch, existing);
  }
  return ch.hotCues.slice();
}

/** Classic auto-loop lengths (beats). */
export const LOOP_PAD_BEATS = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const;

export function getLoopPad(engine: TurntableEngine, deck: 1 | 2): number | null {
  const ch = deck === 1 ? engine.deck1 : engine.deck2;
  if (ch.loopBeats == null) return null;
  const idx = LOOP_PAD_BEATS.findIndex((b) => b === ch.loopBeats);
  return idx >= 0 ? idx : null;
}

export function getNeuralMutes(engine: TurntableEngine, deck: 1 | 2): boolean[] {
  return (deck === 1 ? engine.deck1 : engine.deck2).neuralMutes.slice();
}

function clearLoop(ch: Channel) {
  ch.loopBeats = null;
  ch.loopStartSec = 0;
  ch.loopLenSec = 0;
}

function setBeatLoop(engine: TurntableEngine, ch: Channel, beats: number, bpm: number) {
  const head = getPlayhead(ch);
  const beatSec = 60 / Math.max(1, bpm * ch.pitchRate);
  const len = Math.max(0.05, beats * beatSec);
  const dur = ch.buffer.duration || 1;
  ch.loopBeats = beats;
  ch.loopStartSec = Math.min(head, Math.max(0, dur - len));
  ch.loopLenSec = len;
  if (ch.playing) startChannel(engine, ch, ch.loopStartSec);
}

function handleLoopPad(engine: TurntableEngine, deck: 1 | 2, pad: number, bpm: number) {
  const ch = deck === 1 ? engine.deck1 : engine.deck2;
  const beats = LOOP_PAD_BEATS[pad] ?? 1;
  if (ch.loopBeats === beats) {
    const head = getPlayhead(ch);
    clearLoop(ch);
    if (ch.playing) startChannel(engine, ch, head);
  } else {
    setBeatLoop(engine, ch, beats, bpm);
  }
}

/** Momentary FX while pad held; EQ restored by applyLiveMix on release. */
function handleFxPad(engine: TurntableEngine, deck: 1 | 2, pad: number, down: boolean) {
  const ch = deck === 1 ? engine.deck1 : engine.deck2;
  if (!down) return;
  const t = engine.ctx.currentTime;
  switch (pad) {
    case 0:
      ch.filter.type = "lowpass";
      ch.filter.frequency.setTargetAtTime(420, t, 0.02);
      ch.filter.Q.setTargetAtTime(1.2, t, 0.02);
      break;
    case 1:
      ch.filter.type = "highpass";
      ch.filter.frequency.setTargetAtTime(1800, t, 0.02);
      ch.filter.Q.setTargetAtTime(1.1, t, 0.02);
      break;
    case 2:
      ch.low.gain.setTargetAtTime(-48, t, 0.02);
      break;
    case 3:
      ch.mid.gain.setTargetAtTime(-36, t, 0.02);
      break;
    case 4:
      ch.high.gain.setTargetAtTime(-36, t, 0.02);
      break;
    case 5:
      ch.playbackRate = Math.max(0.25, ch.pitchRate * 0.5);
      if (ch.source) ch.source.playbackRate.setTargetAtTime(ch.playbackRate, t, 0.03);
      break;
    case 6:
      ch.gain.gain.setTargetAtTime(0.02, t, 0.01);
      break;
    case 7:
      ch.playbackRate = Math.max(0.15, ch.pitchRate * 0.2);
      if (ch.source) ch.source.playbackRate.setTargetAtTime(ch.playbackRate, t, 0.08);
      break;
    default:
      break;
  }
}

function applyNeuralEq(ch: Channel) {
  const [kick, bass, mid, hat, voc, ins, mute] = ch.neuralMutes;
  let lowG = 0;
  let midG = 0;
  let highG = 0;
  if (mute) {
    lowG = midG = highG = -48;
  } else {
    if (kick) lowG = -48;
    if (bass) lowG = Math.min(lowG, -28);
    if (mid || voc || ins) midG = -36;
    if (hat) highG = -36;
  }
  ch.low.type = "lowshelf";
  ch.low.frequency.value = 180;
  ch.low.gain.value = lowG;
  ch.mid.type = "peaking";
  ch.mid.frequency.value = 1000;
  ch.mid.Q.value = 0.9;
  ch.mid.gain.value = midG;
  ch.high.type = "highshelf";
  ch.high.frequency.value = 6000;
  ch.high.gain.value = highG;
}

function handleNeuralPad(engine: TurntableEngine, deck: 1 | 2, pad: number) {
  const ch = deck === 1 ? engine.deck1 : engine.deck2;
  if (pad === 7) {
    ch.neuralMutes = Array(8).fill(false);
  } else {
    ch.neuralMutes[pad] = !ch.neuralMutes[pad];
  }
  applyNeuralEq(ch);
}

export type PerformancePadResult = {
  cues: (number | null)[];
  loopPad: number | null;
  neural: boolean[];
};

/**
 * Route pad hits by mode. HOT CUE sets/jumps; LOOP toggles beat loops;
 * FX is momentary; NEURAL toggles stem-style EQ kills. SHIFT clear only in HOT CUE.
 */
export function handlePerformancePad(
  engine: TurntableEngine,
  deck: 1 | 2,
  pad: number,
  opts: { clear: boolean; down: boolean; modeBase: number; bpm: number },
): PerformancePadResult {
  const ch = deck === 1 ? engine.deck1 : engine.deck2;
  const { modeBase } = opts;

  if (modeBase === 0) {
    if (opts.down) handlePad(engine, deck, pad, opts.clear);
  } else if (modeBase === 16) {
    if (opts.down) handleLoopPad(engine, deck, pad, opts.bpm);
  } else if (modeBase === 32) {
    handleFxPad(engine, deck, pad, opts.down);
    if (!opts.down) {
      ch.playbackRate = ch.pitchRate;
      if (ch.source && ch.playing) {
        ch.source.playbackRate.setTargetAtTime(ch.pitchRate, engine.ctx.currentTime, 0.04);
      }
    }
  } else if (modeBase === 80) {
    if (opts.down) handleNeuralPad(engine, deck, pad);
  }

  return {
    cues: ch.hotCues.slice(),
    loopPad: getLoopPad(engine, deck),
    neural: ch.neuralMutes.slice(),
  };
}

/** Relative jog ticks (value−64). Nudges rate while playing, scrubs while stopped. */
export function handleJog(engine: TurntableEngine, deck: 1 | 2, delta: number) {
  if (delta === 0) return;
  const ch = deck === 1 ? engine.deck1 : engine.deck2;
  if (ch.playing && ch.source) {
    const rate = Math.max(0.25, Math.min(3, ch.pitchRate + delta * 0.12));
    ch.playbackRate = rate;
    ch.source.playbackRate.setTargetAtTime(rate, engine.ctx.currentTime, 0.01);
    ch.source.playbackRate.setTargetAtTime(ch.pitchRate, engine.ctx.currentTime + 0.08, 0.05);
    window.setTimeout(() => {
      if (ch.source && ch.playing) {
        ch.playbackRate = ch.pitchRate;
      }
    }, 120);
  } else {
    const dur = ch.buffer.duration || 1;
    ch.startOffset = ((ch.startOffset + delta * 0.045) % dur + dur) % dur;
  }
}

export async function ensureAudio(engine: TurntableEngine) {
  if (engine.ctx.state === "suspended") await engine.ctx.resume();
}

export function setDeckPlaying(engine: TurntableEngine, deck: 1 | 2, playing: boolean) {
  const ch = deck === 1 ? engine.deck1 : engine.deck2;
  if (playing) {
    if (!ch.playing) startChannel(engine, ch);
  } else stopChannel(ch);
}

export function cueStopDeck(engine: TurntableEngine, deck: 1 | 2) {
  setDeckPlaying(engine, deck, false);
}

export async function loadTrack(engine: TurntableEngine, deck: 1 | 2, trackId: TrackId) {
  const ch = deck === 1 ? engine.deck1 : engine.deck2;
  const wasPlaying = ch.playing;
  stopChannel(ch);
  ch.trackId = trackId;
  ch.buffer = await loadTrackBuffer(engine.ctx, trackById(trackId));
  ch.startOffset = 0;
  ch.hotCues = Array(8).fill(null);
  clearLoop(ch);
  ch.neuralMutes = Array(8).fill(false);
  if (wasPlaying) startChannel(engine, ch, 0);
}

export function applyDeckFilter(engine: TurntableEngine, deck: 1 | 2, cc: number) {
  midiToFilter(deck === 1 ? engine.deck1.filter : engine.deck2.filter, cc);
}

export function applyDeckLow(engine: TurntableEngine, deck: 1 | 2, cc: number) {
  midiToLow(deck === 1 ? engine.deck1.low : engine.deck2.low, cc);
}

export function applyDeckMid(engine: TurntableEngine, deck: 1 | 2, cc: number) {
  midiToMid(deck === 1 ? engine.deck1.mid : engine.deck2.mid, cc);
}

export function applyDeckHigh(engine: TurntableEngine, deck: 1 | 2, cc: number) {
  midiToHigh(deck === 1 ? engine.deck1.high : engine.deck2.high, cc);
}

export function applyCrossfader(
  engine: TurntableEngine,
  xf: number,
  vol1: number,
  vol2: number,
) {
  const x = Math.min(1, Math.max(0, xf / 127));
  engine.deck1.gain.gain.value = Math.cos(x * 0.5 * Math.PI) * (vol1 / 127) * 0.9;
  engine.deck2.gain.gain.value = Math.sin(x * 0.5 * Math.PI) * (vol2 / 127) * 0.9;
}

export function applyMaster(engine: TurntableEngine, cc: number) {
  engine.master.gain.value = (cc / 127) * 0.95;
}

export function applyDeckPitch(engine: TurntableEngine, deck: 1 | 2, cc: number) {
  const ch = deck === 1 ? engine.deck1 : engine.deck2;
  // 64 = 1.0, full range ≈ ±8% (typical DJ pitch)
  const rate = 1 + ((cc - 64) / 64) * 0.08;
  ch.pitchRate = rate;
  ch.playbackRate = rate;
  if (ch.source && ch.playing) {
    ch.source.playbackRate.setTargetAtTime(rate, engine.ctx.currentTime, 0.02);
  }
}

/** Catalog BPM × tempo fader (±8% at ends). */
export function effectiveBpm(catalogBpm: number, pitchCc: number): number {
  const rate = 1 + ((pitchCc - 64) / 64) * 0.08;
  return catalogBpm * rate;
}

export function applyLiveMix(
  engine: TurntableEngine,
  values: Partial<Record<string, number>>,
) {
  const v = (k: string, fallback: number) => values[k] ?? fallback;
  applyDeckFilter(engine, 1, v("deck1.filter", 64));
  applyDeckLow(engine, 1, v("deck1.low", 64));
  applyDeckMid(engine, 1, v("deck1.mid", 64));
  applyDeckHigh(engine, 1, v("deck1.high", 64));
  applyDeckPitch(engine, 1, v("deck1.pitch", 64));
  applyDeckFilter(engine, 2, v("deck2.filter", 64));
  applyDeckLow(engine, 2, v("deck2.low", 64));
  applyDeckMid(engine, 2, v("deck2.mid", 64));
  applyDeckHigh(engine, 2, v("deck2.high", 64));
  applyDeckPitch(engine, 2, v("deck2.pitch", 64));
  applyCrossfader(engine, v("crossfader", 64), v("deck1.volume", 100), v("deck2.volume", 100));
  applyMaster(engine, v("master", 100));
  // Neural stem kills win over mixer EQ while latched
  if (engine.deck1.neuralMutes.some(Boolean)) applyNeuralEq(engine.deck1);
  if (engine.deck2.neuralMutes.some(Boolean)) applyNeuralEq(engine.deck2);
}

export async function disposeTurntable(engine: TurntableEngine | null) {
  if (!engine) return;
  stopChannel(engine.deck1);
  stopChannel(engine.deck2);
  await engine.ctx.close().catch(() => undefined);
}
