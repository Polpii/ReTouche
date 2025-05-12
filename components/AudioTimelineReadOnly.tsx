/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import React, {
  useEffect,
  useRef,
  useState,
  MouseEvent as ReactMouseEvent,
} from "react";
import { Midi } from "@tonejs/midi";
import { getProxiedUrl } from "../app/utils/proxyUrl";

/* ─────────── types ─────────── */
export interface Section {
  id: string;
  start: number;
  end: number;
  performanceScore?: number;
}
interface Props {
  midiUrl?: string;
  totalTime: number;
  sections: Section[];
  onPlaySection: (s: Section) => void;
  containerHeight?: number;
  currentTime?: number;
  noteColors?: string[];
}

/* ─────────── helpers ─────────── */
const DEFAULT_H = 200;
const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));

/* =================================================================== */
const AudioTimelineReadOnly: React.FC<Props> = ({
  midiUrl,
  totalTime,
  sections,
  onPlaySection,
  containerHeight = DEFAULT_H,
  currentTime,
  noteColors = [],
}) => {
  /* refs & states */
  const timelineRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* copie locale de `sections` pour le drag (aucune persistance) */
  const [local, setLocal] = useState<Section[]>(sections);
  useEffect(() => setLocal(sections), [sections]);

  /* marqueurs supprimés (= frontières fusionnées) */
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setRemoved((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  /* ────────── drag des triangles ────────── */
  const drag = useRef<{ idx: number; start: number; px: number } | null>(null);
  const onStartDrag =
    (idx: number) =>
    (e: ReactMouseEvent): void => {
      if (!timelineRef.current) return;
      const { left } = timelineRef.current.getBoundingClientRect();
      drag.current = { idx, start: local[idx].start, px: e.clientX - left };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onStop);
    };

  const onMove = (e: MouseEvent) => {
    if (!drag.current || !timelineRef.current) return;
    const { idx, start, px } = drag.current;
    const { left, width } = timelineRef.current.getBoundingClientRect();
    const delta = ((e.clientX - left - px) / width) * totalTime;

    setLocal((prev) => {
      const n = [...prev];
      const newStart = clamp(
        start + delta,
        idx === 0 ? 0 : n[idx - 1].start + 0.1,
        idx === n.length - 1 ? totalTime - 0.1 : n[idx + 1].end - 0.1
      );
      if (idx > 0) n[idx - 1] = { ...n[idx - 1], end: newStart };
      n[idx] = { ...n[idx], start: newStart };
      return n;
    });
  };

  const onStop = () => {
    drag.current = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onStop);
  };

  /* ────────── canvas : piano-roll ────────── */
  useEffect(() => {
    if (!midiUrl || !canvasRef.current || !timelineRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = timelineRef.current!.getBoundingClientRect().width;
      canvas.height = containerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    (async () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#eee";
      for (let x = 0; x <= canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      try {
        const buf = await fetch(getProxiedUrl(midiUrl)).then((r) =>
          r.arrayBuffer()
        );
        const midi = new Midi(buf);
        let notes: any[] = [];
        midi.tracks.forEach((t) => (notes = notes.concat(t.notes)));
        notes.sort((a, b) => a.time - b.time);

        const min = 21,
          max = 108,
          rng = max - min;
        notes.forEach((n, i) => {
          const x = (n.time / totalTime) * canvas.width;
          const w = (n.duration / totalTime) * canvas.width;
          const y = canvas.height - ((n.midi - min) / rng) * canvas.height;
          ctx.fillStyle = noteColors[i] ?? "red";
          ctx.fillRect(x, y - 2, w, 4);
        });
      } catch (err) {
        console.error("MIDI load error:", err);
      }
    })();

    return () => window.removeEventListener("resize", resize);
  }, [midiUrl, totalTime, containerHeight, noteColors]);

  /* ────────── lecture fusionnée ────────── */
  const playFrom = (sec: Section) => {
    /* cherche la fin du groupe fusionné */
    const idx = local.findIndex((s) => s.id === sec.id);
    let end = sec.end;
    for (let i = idx + 1; i < local.length; i++) {
      if (removed.has(local[i].id)) end = local[i].end;
      else break;
    }
    onPlaySection({ id: sec.id, start: sec.start, end });
  };

  /* ────────── rendu ────────── */
  const elems: React.ReactNode[] = [];

  local.forEach((sec, i) => {
    const leftPct = (sec.start / totalTime) * 100;
    const widthPct = ((sec.end - sec.start) / totalTime) * 100;

    /* zone de clic sur toute la section */
    elems.push(
      <div
        key={`zone-${sec.id}`}
        style={{
          position: "absolute",
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          top: 0,
          bottom: 0,
          cursor: "pointer",
          zIndex: 1,
        }}
        onClick={() => playFrom(sec)}
      />
    );

    /* trait violet */
    elems.push(
      <div
        key={`line-${sec.id}`}
        style={{
          position: "absolute",
          left: `${leftPct}%`,
          top: 0,
          bottom: 0,
          width: 2,
          background: "#800080",
          opacity: removed.has(sec.id) ? 0.35 : 1,
        }}
      />
    );

    /* triangle drag (tous sauf peut-être le premier) */
    if (i !== 0)
      elems.push(
        <div
          key={`tri-${sec.id}`}
          style={{
            position: "absolute",
            left: `${leftPct}%`,
            top: -30,
            transform: "translateX(-50%)",
            cursor: "ew-resize",
            zIndex: 3,
          }}
          onMouseDown={onStartDrag(i)}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "18px solid transparent",
              borderRight: "18px solid transparent",
              borderTop: "20px solid #800080",
            }}
          />
        </div>
      );

    /* bouton ✕ / ⟲  (fusion) */
    if (i !== 0)
      elems.push(
        <div
          key={`merge-${sec.id}`}
          onClick={(e) => {
            e.stopPropagation();
            toggle(sec.id);
          }}
          style={{
            position: "absolute",
            left: `${leftPct}%`,
            bottom: -24,
            transform: "translateX(-50%)",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: "50%",
            width: 20,
            height: 20,
            textAlign: "center",
            lineHeight: "19px",
            fontSize: 14,
            cursor: "pointer",
            userSelect: "none",
            zIndex: 4,
          }}
        >
          {removed.has(sec.id) ? "⟲" : "×"}
        </div>
      );

    /* bouton Play (au-dessus du trait) — masqué si fusionné */
    if (!removed.has(sec.id))
      elems.push(
        <div
          key={`play-${sec.id}`}
          onClick={(e) => {
            e.stopPropagation();
            playFrom(sec);
          }}
          style={{
            position: "absolute",
            left: `${leftPct}%`,
            top: -16,
            transform: "translateX(-50%)",
            background: "green",
            border: "2px solid green",
            borderRadius: "50%",
            width: 22,
            height: 22,
            color: "#fff",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 4,
            userSelect: "none",
          }}
        >
          ▶
        </div>
      );
  });

  return (
    <div
      ref={timelineRef}
      style={{
        position: "relative",
        width: "97%",
        maxWidth: "100vw",
        height: containerHeight,
        border: "1px solid #ccc",
        overflow: "visible",
        marginBottom: "1rem",
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
      {elems}
      {typeof currentTime === "number" && (
        <div
          style={{
            position: "absolute",
            left: `${(currentTime / totalTime) * 100}%`,
            top: 0,
            bottom: 0,
            width: 1,
            background: "red",
            zIndex: 1,
          }}
        />
      )}
    </div>
  );
};

export default AudioTimelineReadOnly;
