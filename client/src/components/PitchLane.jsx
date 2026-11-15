import React, { useEffect, useMemo, useRef } from 'react';

const PAST_SEC = 2;
const FUTURE_SEC = 5;
const WINDOW = PAST_SEC + FUTURE_SEC;

/** Shift m by whole octaves so it lands as close as possible to target. */
const foldToward = (m, target) => m + 12 * Math.round((target - m) / 12);

/**
 * Scrolling bars for the reference melody with a live dot for the singer.
 * Draws on its own animation loop (reads time from getTime) so it stays smooth
 * without re-rendering React every frame.
 */
export default function PitchLane({ pitch, getTime, recorderRef }) {
  const canvasRef = useRef(null);
  const range = useMemo(() => {
    const midis = (pitch?.notes || []).map((n) => n.midi);
    if (!midis.length) return { lo: 55, hi: 72 };
    return { lo: Math.min(...midis) - 3, hi: Math.max(...midis) + 3 };
  }, [pitch]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const css = getComputedStyle(canvas);
    const colors = {
      note: css.getPropertyValue('--lane-note').trim() || '#4b5a82',
      active: css.getPropertyValue('--accent').trim() || '#ffb347',
      hit: css.getPropertyValue('--good').trim() || '#4cc38a',
      miss: css.getPropertyValue('--poor').trim() || '#e5646b',
      line: css.getPropertyValue('--muted').trim() || '#8b93a7',
      ring: css.getPropertyValue('--text').trim() || '#202020',
    };
    let raf;
    let lastTarget = (range.lo + range.hi) / 2;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const now = getTime();
      const x = (t) => ((t - now + PAST_SEC) / WINDOW) * W;
      const rowH = H / (range.hi - range.lo);
      const y = (m) => H - (m - range.lo) * rowH;
      const refAt = (t) => {
        const i = Math.round(t / (pitch?.hopSec || 0.025));
        return pitch?.frames?.[i] ?? null;
      };

      // Reference melody.
      for (const n of pitch?.notes || []) {
        if (n.end < now - PAST_SEC || n.start > now + FUTURE_SEC) continue;
        ctx.fillStyle = n.start <= now && now < n.end ? colors.active : colors.note;
        ctx.globalAlpha = n.end < now ? 0.45 : 1;
        const h = Math.max(6, rowH * 0.9);
        ctx.beginPath();
        ctx.roundRect(x(n.start), y(n.midi) - h / 2, Math.max(3, x(n.end) - x(n.start)), h, 3);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Playhead.
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x(now), 0);
      ctx.lineTo(x(now), H);
      ctx.stroke();

      // Singer: recent trail, octave-folded onto the melody so any octave counts.
      const recorder = recorderRef.current;
      // The singer may have skipped around, so look at the newest points rather than assuming time order.
      const track = recorder?.rawTrack || [];
      for (let i = track.length - 1; i >= Math.max(0, track.length - 240); i--) {
        const [t, m] = track[i];
        if (t < now - PAST_SEC || t > now) continue;
        const ref = refAt(t);
        const shown = foldToward(m, ref ?? lastTarget);
        ctx.fillStyle = ref == null ? colors.line : Math.abs(shown - ref) <= 1 ? colors.hit : colors.miss;
        ctx.globalAlpha = 0.35 + 0.65 * (1 - (now - t) / PAST_SEC);
        ctx.beginPath();
        ctx.arc(x(t), y(shown), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const refNow = refAt(now);
      if (refNow != null) lastTarget = refNow;
      if (recorder?.live) {
        const shown = foldToward(recorder.live.midi, lastTarget);
        ctx.fillStyle = refNow != null && Math.abs(shown - refNow) <= 1 ? colors.hit : colors.active;
        ctx.strokeStyle = colors.ring;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x(now), Math.max(6, Math.min(H - 6, y(shown))), 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [pitch, getTime, recorderRef, range]);

  return (
    <div className="pitch-lane">
      <canvas ref={canvasRef} aria-label="Pitch lane: bars are the melody, the dot is your voice" />
      <span className="lane-hint muted">Bars: melody · Dot: your voice (any octave)</span>
    </div>
  );
}
