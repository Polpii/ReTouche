import React from "react";

interface VideoTransportBarProps {
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSeekAbs: (t: number) => void;
  onSeekRel: (d: number) => void;
}

/**
 * Barre de transport :
 *  ┌──────────────────────── slider (exactement la même largeur que AudioTimelineReadOnly)
 *  └───────── boutons + horloge
 */
export default function VideoTransportBar({
  currentTime,
  duration,
  onPlay,
  onPause,
  onSeekAbs,
  onSeekRel,
}: VideoTransportBarProps) {
  return (
    <div
      /* même largeur que la timeline : 100 vw – 2 rem  */
      style={{
        width: "calc(100vw - 2rem)",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "0.45rem",
      }}
    >
      {/* ─── Progress bar ───────────────────────────────────────────── */}
      <input
        type="range"
        min={0}
        max={duration}
        step={0.1}
        value={currentTime}
        onChange={(e) => onSeekAbs(parseFloat(e.currentTarget.value))}
        style={{ width: "100%" }}   // occupe toute la largeur du conteneur
      />

      {/* ─── Boutons sous le slider ─────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <button onClick={onPlay}>▷</button>
        <button onClick={onPause}>❚❚</button>
        <button onClick={() => onSeekRel(-5)}>⟲</button>
        <button onClick={() => onSeekRel(5)}>⟳</button>

        {/* horloge, facultatif mais pratique */}
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {currentTime.toFixed(1)} / {duration.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
