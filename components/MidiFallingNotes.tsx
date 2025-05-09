/* components/MidiFallingNotes.tsx */
"use client";
import React, { useRef, useEffect } from "react";

export interface NoteEvent {
  midi: number;     // 21-108
  time: number;     // s depuis le début de la section
  duration: number; // s
}

interface Props {
  events: NoteEvent[];
  sectionStart: number; // performance.now() au déclenchement
  speed: number;        // playbackRate
  width: number;        // ← NEW  largeur imposée par absCrop
  height: number;       // ← NEW  hauteur = distance exacte jusqu’à la ligne du bas
}

/* ------------------------------------------------------------------ */
const LOOKAHEAD  = 5;                     // secondes affichées
const NB_KEYS    = 88;
const FIRST_MIDI = 21;
const WHITE_KEYS = [0,2,4,5,7,9,11];

export default function MidiFallingNotes({
  events, sectionStart, speed,
  width, height,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = canvasRef.current!;
    cvs.width  = width;                   // ← taille dynamique
    cvs.height = height;

    const ctx  = cvs.getContext("2d")!;
    const keyW = width / NB_KEYS;

    function draw() {
      const now = ((performance.now() - sectionStart) / 1000) * speed;
      ctx.clearRect(0, 0, width, height);

      events.forEach(ev => {
        const dt = ev.time - now;
        if (dt < -0.2 || dt > LOOKAHEAD) return;

        const x = ((ev.midi - FIRST_MIDI) / (NB_KEYS - 1)) * width;
        const y = (1 - dt / LOOKAHEAD) * height;   // 0 → top, height → ligne du bas

        ctx.fillStyle = WHITE_KEYS.includes(ev.midi % 12) ? "#ffd54f" : "#ff9800";
        ctx.fillRect(x, y - 6, keyW, 6);
      });
      requestAnimationFrame(draw);
    }
    draw();
  }, [events, sectionStart, speed, width, height]);

  /* on ne fixe plus width/height ici – ils sont mis à jour au mount */
  return <canvas ref={canvasRef} />;
}
