import React, { ReactNode, CSSProperties } from "react";

interface VideoTransportBarProps {
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSeekAbs: (t: number) => void;
  onSeekRel: (d: number) => void;
  children?: ReactNode;
  rightSlot?: ReactNode;
}

/* Style de base pour tous les boutons de la barre */
const btn: CSSProperties = {
  background: "#0070f3",
  color: "#fff",
  padding: "1rem 2rem",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "2.4rem",
};

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
  children,
  rightSlot,
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
        style={{ width: "203vh" }}   // occupe toute la largeur du conteneur
      />

      {/* ─── Boutons sous le slider ─────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          //justifyContent: "center", //
        }}
      >
        <button style={btn} onClick={onPlay}>▷</button>
        <button style={btn} onClick={onPause}>❚❚</button>
        <button style={btn} onClick={() => onSeekRel(-5)}>⟲</button>
        <button style={btn} onClick={() => onSeekRel(5)}>⟳</button>
        {children}

        {/* slot aligné à droite */}
        {rightSlot && (
          <div style={{position:"absolute", right:"2vh", top:0, height:"100%", display:"flex", alignItems:"center", gap:"0.6rem"}}>
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  );
}
