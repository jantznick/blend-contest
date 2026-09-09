import { useEffect, useRef } from "react";

type Props = {
  peaks: Float32Array;
  playhead: number;
  duration: number;
  cues?: (number | null)[];
  playing?: boolean;
  label?: string;
};

export function WaveformStrip({
  peaks,
  playhead,
  duration,
  cues,
  playing,
  label,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 2 || h < 2) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = "#16140f";
      ctx.fillRect(0, 0, w, h);

      const mid = h / 2;
      const n = peaks.length || 1;
      ctx.fillStyle = playing ? "#3dffa8aa" : "#3dffa866";
      for (let i = 0; i < n; i++) {
        const x = (i / n) * w;
        const amp = (peaks[i] ?? 0) * (h * 0.42);
        ctx.fillRect(x, mid - amp, Math.max(1, w / n - 0.5), amp * 2);
      }

      if (cues) {
        for (let i = 0; i < cues.length; i++) {
          const t = cues[i];
          if (t == null || duration <= 0) continue;
          const x = (t / duration) * w;
          ctx.strokeStyle = "#ffb86c";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, 4);
          ctx.lineTo(x, h - 4);
          ctx.stroke();
          ctx.fillStyle = "#ffb86c";
          ctx.font = "10px IBM Plex Mono, monospace";
          ctx.fillText(String(i + 1), x + 3, 12);
        }
      }

      if (duration > 0) {
        const x = (playhead / duration) * w;
        ctx.strokeStyle = "#fff8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [peaks, playhead, duration, cues, playing]);

  return (
    <div className="wave-strip">
      {label && <span className="wave-strip-label">{label}</span>}
      <div className="wave-strip-canvas" ref={wrapRef}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
