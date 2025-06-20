/* components/MidiFallingNotes.tsx */
"use client";
import React, { useRef, useEffect } from "react";

export interface NoteEvent {
  midi: number;     // 21-108
  time: number;     // seconds since section start
  duration: number; // seconds
}

interface Props {
  events: NoteEvent[];
  sectionStart: number; // performance.now() at play start
  speed: number;        // playbackRate
  width: number;        // canvas width
  height: number;       // canvas height
}

// Constants
const LOOKAHEAD = 5;                     // seconds visible
const NB_KEYS = 88;
const FIRST_MIDI = 21;
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

export default function MidiFallingNotes({ events, sectionStart, speed, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const keyW = width / NB_KEYS;

    function draw() {
      // current playback time in section (s)
      const now = ((performance.now() - sectionStart) / 1000) * speed;

      // clear canvas
      ctx.clearRect(0, 0, width, height);
      // set background to black
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      
      events.forEach(ev => {
        // head and tail relative times
        const dtHead = ev.time - now;
        const dtTail = ev.time + ev.duration - now;
        // skip if entirely out of visible window
        if (dtHead > LOOKAHEAD) return;
        if (dtTail < 0) return;

        // clamp to [0, LOOKAHEAD]
        const clampedHead = Math.min(Math.max(dtHead, 0), LOOKAHEAD);
        const clampedTail = Math.min(Math.max(dtTail, 0), LOOKAHEAD);

        // pixel positions
        const yHead = (1 - clampedHead / LOOKAHEAD) * height;
        const yTail = (1 - clampedTail / LOOKAHEAD) * height;
        const rectY = yHead;
        const rectH = yTail - yHead;

        // color by white/black key
        ctx.fillStyle = WHITE_KEYS.includes(ev.midi % 12) ? "#66BB6A" : "#1B5E20";
        // x position
        const x = ((ev.midi - FIRST_MIDI) / (NB_KEYS - 1)) * width;
        // draw rectangle spanning duration
        // remplissage
        ctx.fillRect(x, rectY, keyW, rectH);

        // contour noir
        ctx.lineWidth   = 0.75;       // épaisseur du cadre (ajustez si besoin)
        ctx.strokeStyle = "#fff";  // couleur du contour
        ctx.strokeRect(x, rectY, keyW, rectH);

      });

      requestAnimationFrame(draw);
    }

    draw();
  }, [events, sectionStart, speed, width, height]);

  return <canvas ref={canvasRef} />;
}
