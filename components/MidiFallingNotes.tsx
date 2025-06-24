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
  sectionStart: number; // performance.now() relevé au départ
  speed: number;
  width: number;
  height: number;
}

/* ─── Constantes ─────────────────────────────────────────────────────────── */
const LOOKAHEAD  = 5;              // secondes affichées
const NB_KEYS    = 88;
const FIRST_MIDI = 21;
const WHITE_KEYS = new Set([0, 2, 4, 5, 7, 9, 11]);

const GAP_PX   = 2;                // espace entre notes successives
const BORDER_W = 0.75;

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const noteColor = (m: number) =>
  WHITE_KEYS.has(m % 12) ? "#66BB6A" : "#1B5E20";

function shade(hex: string, pct: number) {
  const n = parseInt(hex.slice(1), 16);
  const a = Math.round(2.55 * pct);
  const R = Math.min(255, (n >> 16) + a);
  const G = Math.min(255, ((n >> 8) & 0xff) + a);
  const B = Math.min(255, (n & 0xff) + a);
  return "#" + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
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

      /* ── Fond noir ── */
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      /* ── Boucle sur les notes ── */
      for (const ev of events) {
        const dtHead = ev.time - now;                // tête (arrivée au clavier)
        const dtTail = ev.time + ev.duration - now;  // queue (fin de note)

        if (dtHead > LOOKAHEAD || dtTail < 0) continue; // hors fenêtre

        const clHead = Math.min(Math.max(dtHead, 0), LOOKAHEAD);
        const clTail = Math.min(Math.max(dtTail, 0), LOOKAHEAD);

        const yHead = (1 - clHead / LOOKAHEAD) * height; // bas du rectangle
        const yTail = (1 - clTail / LOOKAHEAD) * height; // haut du rectangle

        /* Inversion repère → haut puis bas, avec l’écart visuel */
        const yTop    = yTail;
        const yBottom = yHead - GAP_PX;
        const rectH   = yBottom - yTop;
        if (rectH <= 0) continue;  // rectangle invisible

        const x    = ((ev.midi - FIRST_MIDI) / (NB_KEYS - 1)) * width;
        const col  = noteColor(ev.midi);

        /* Dégradé : tête plus claire */
        const grad = ctx.createLinearGradient(0, yTop, 0, yBottom);
        grad.addColorStop(0, shade(col, +20));
        grad.addColorStop(0.12, col);
        grad.addColorStop(1, col);
        ctx.fillStyle = grad;

        /* Dessin rectangle + contour */
        ctx.fillRect(x, yTop, keyW, rectH);
        ctx.lineWidth   = BORDER_W;
        ctx.strokeStyle = "#fff";
        ctx.strokeRect(
          x + BORDER_W / 2,
          yTop + BORDER_W / 2,
          keyW - BORDER_W,
          rectH - BORDER_W
        );
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
