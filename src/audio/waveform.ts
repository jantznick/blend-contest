/** Downsample an AudioBuffer into peak magnitudes for canvas drawing. */

export function computePeaks(buffer: AudioBuffer, bars = 256): Float32Array {
  const peaks = new Float32Array(bars);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const block = Math.max(1, Math.floor(ch0.length / bars));
  for (let i = 0; i < bars; i++) {
    const start = i * block;
    const end = Math.min(ch0.length, start + block);
    let max = 0;
    for (let j = start; j < end; j++) {
      const a = Math.abs(ch0[j]!);
      const b = ch1 ? Math.abs(ch1[j]!) : 0;
      const m = a > b ? a : b;
      if (m > max) max = m;
    }
    peaks[i] = max;
  }
  return peaks;
}

/** Placeholder waveform when Tidal audio isn't decoded locally (metadata-driven UI). */
export function placeholderPeaks(seed: string, bars = 256): Float32Array {
  const peaks = new Float32Array(bars);
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  for (let i = 0; i < bars; i++) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const n = (hash & 0xffff) / 0xffff;
    const env = 0.35 + 0.55 * Math.sin((i / bars) * Math.PI);
    peaks[i] = n * env * 0.85;
  }
  return peaks;
}
