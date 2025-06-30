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
  oversample?: number;          // ← nouveau
}

/* ─── Constantes ─────────────────────────────────────────────────────────── */
const LOOKAHEAD  = 5;
const NB_KEYS    = 88;
const FIRST_MIDI = 21;
const WHITE_KEYS = new Set([0, 2, 4, 5, 7, 9, 11]);

const GAP_Y     = 2;
const GAP_X      = 1;
const RADIUS_PX  = 2;

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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(x, y, w, h, r);
  } else {
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
  oversample = 1,                // ← valeur par défaut
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);

  useEffect(() => {
    /* --- Préparation canvas ------------------------------------------------ */
    const canvas = canvasRef.current!;
    const dpr = (window.devicePixelRatio || 1) * oversample;

    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;

    const ctx  = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    const keyW = Math.round(width / NB_KEYS);

    /* --- Boucle d’animation ----------------------------------------------- */
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
        if (dtHead > LOOKAHEAD || dtTail < 0) continue;

        const head = Math.min(Math.max(dtHead, 0), LOOKAHEAD);
        const tail = Math.min(Math.max(dtTail, 0), LOOKAHEAD);

        const yHead = (1 - head / LOOKAHEAD) * height;
        const yTail = (1 - tail / LOOKAHEAD) * height;

        const yTop    = yTail;
        const yBottom = yHead - GAP_Y;
        const rectH   = yBottom - yTop;
        if (rectH <= 0) continue;

        //const x   = Math.round(((ev.midi - FIRST_MIDI) / (NB_KEYS - 1)) * width);
        const xFull = ((ev.midi - FIRST_MIDI) / (NB_KEYS - 1)) * width;
        const rectW = keyW - GAP_X;
        const x     = xFull + GAP_X / 2;
        const col = noteColor(ev.midi);
        const grad  = ctx.createLinearGradient(0, yTop, 0, yBottom);
        grad.addColorStop(0, shade(col, +20));
        grad.addColorStop(0.12, col);
        grad.addColorStop(1, col);
        ctx.fillStyle = grad;

        ctx.beginPath();
        //drawRoundedRect(ctx, x, yTop, keyW, rectH, RADIUS_PX);
        drawRoundedRect(ctx, x, yTop, rectW, rectH, RADIUS_PX);
        ctx.lineWidth   = 0.4;
        ctx.strokeStyle = "#000";
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [events, sectionStart, speed, width, height, oversample]);  // ← oversample

  return <canvas ref={canvasRef} />;
}
