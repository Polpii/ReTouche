/* components/MidiFallingNotes.tsx */
"use client";
import React, { useRef, useEffect } from "react";

export interface NoteEvent {
  midi: number;
  time: number;
  duration: number;
}

interface Props {
  events: NoteEvent[];
  sectionStart: number;
  speed: number;
  width: number;
  height: number;
}

/* ─── Constantes ─────────────────────────────────────────────────────────── */
const LOOKAHEAD  = 5;                 // s visibles
const NB_KEYS    = 88;
const FIRST_MIDI = 21;
const WHITE_KEYS = new Set([0, 2, 4, 5, 7, 9, 11]);

const GAP_PX     = 2;                 // espace vertical
const RADIUS_PX  = 2;                 // arrondi des coins (≃ 3-4 px)

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const noteColor = (m: number) =>
  WHITE_KEYS.has(m % 12) ? "#66BB6A" : "#1B5E20";

const shade = (hex: string, pct: number) => {
  const n = parseInt(hex.slice(1), 16);
  const a = Math.round(2.55 * pct);
  const R = Math.min(255, (n >> 16) + a);
  const G = Math.min(255, ((n >> 8) & 0xff) + a);
  const B = Math.min(255, (n & 0xff) + a);
  return "#" + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
};

/* Dessine un rectangle arrondi universel (fallback si roundRect absent) */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if ((ctx as any).roundRect) {
    // navigateurs modernes : plus simple
    (ctx as any).roundRect(x, y, w, h, r);
  } else {
    // polyfill
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  ctx.fill();
}

/* ─── Composant ──────────────────────────────────────────────────────────── */
export default function MidiFallingNotes({
  events,
  sectionStart,
  speed,
  width,
  height,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width  = width;
    canvas.height = height;
    const ctx  = canvas.getContext("2d")!;
    const keyW = width / NB_KEYS;

    const draw = () => {
      const now = ((performance.now() - sectionStart) / 1000) * speed;

      /* Fond noir */
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      /* Notes */
      for (const ev of events) {
        const dtHead = ev.time - now;
        const dtTail = ev.time + ev.duration - now;
        if (dtHead > LOOKAHEAD || dtTail < 0) continue; // hors champ

        const head = Math.min(Math.max(dtHead, 0), LOOKAHEAD);
        const tail = Math.min(Math.max(dtTail, 0), LOOKAHEAD);

        const yHead = (1 - head / LOOKAHEAD) * height;
        const yTail = (1 - tail / LOOKAHEAD) * height;

        const yTop    = yTail;
        const yBottom = yHead - GAP_PX;
        const rectH   = yBottom - yTop;
        if (rectH <= 0) continue;

        const x     = ((ev.midi - FIRST_MIDI) / (NB_KEYS - 1)) * width;
        const col   = noteColor(ev.midi);
        const grad  = ctx.createLinearGradient(0, yTop, 0, yBottom);
        grad.addColorStop(0, shade(col, +20));
        grad.addColorStop(0.12, col);
        grad.addColorStop(1, col);
        ctx.fillStyle = grad;

        ctx.beginPath();
        drawRoundedRect(ctx, x, yTop, keyW, rectH, RADIUS_PX);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [events, sectionStart, speed, width, height]);

  return <canvas ref={canvasRef} />;
}
