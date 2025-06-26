"use client";
import React, { useState, useRef, useEffect } from "react";
import { Midi } from "@tonejs/midi";

export interface Marker {
  id: string;
  time: number; // en secondes
  note: string;
}

export interface AudioTimelineEditorProps {
  audioUrl?: string; // URL du fichier audio (si disponible)
  midiUrl?: string;  // URL du fichier MIDI (si présent)
  totalTime: number; // durée totale en secondes
  initialMarkers?: Marker[];
  onMarkersChange?: (markers: Marker[]) => void;
  containerHeight?: number; // hauteur en pixels, par défaut 100
  currentTime?: number; // pour le curseur de lecture (optionnel)
  onPlaySection?: (section: Section) => void;
}

export interface Section {
  id: string;
  start: number;
  end: number;
  performanceScore: number;
}

const AudioTimelineEditor: React.FC<AudioTimelineEditorProps> = ({
  audioUrl,
  midiUrl,
  totalTime,
  initialMarkers = [],
  onMarkersChange,
  containerHeight = 100,
  currentTime,
  onPlaySection,
}) => {
  const [markers, setMarkers] = useState<Marker[]>(initialMarkers);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
    }
  }, [audioUrl]);

  useEffect(() => {
    if (!timelineRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = timelineRef.current.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (midiUrl) {
      fetch(midiUrl)
        .then((res) => {
          if (!res.ok) throw new Error("Fichier MIDI non trouvé");
          return res.arrayBuffer();
        })
        .then((buffer) => {
          const midi = new Midi(buffer);
          midi.tracks.forEach((track) => {
            track.notes.forEach((note) => {
              const x = (note.time / totalTime) * canvas.width;
              const width = (note.duration / totalTime) * canvas.width;
              const minNote = 21, maxNote = 108;
              const noteRange = maxNote - minNote;
              const y = canvas.height - ((note.midi - minNote) / noteRange) * canvas.height;
              const noteHeight = 4;
              ctx.fillStyle = "rgba(0, 0, 255, 0.3)";
              ctx.fillRect(x, y - noteHeight / 2, width, noteHeight);
            });
          });
        })
        .catch((err) => {
          console.error("Erreur de chargement du MIDI", err);
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = "#ddd";
          for (let x = 0; x < canvas.width; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
          for (let y = 0; y < canvas.height; y += 10) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
        });
    } else {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#ddd";
      for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }
  }, [midiUrl, totalTime]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === timelineRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const newTime = (x / rect.width) * totalTime;
      addMarker(newTime);
    }
  };

  const addMarker = (time: number) => {
    const newMarker: Marker = { id: Date.now().toString(), time, note: "" };
    const newMarkers = [...markers, newMarker].sort((a, b) => a.time - b.time);
    setMarkers(newMarkers);
    onMarkersChange?.(newMarkers);
  };

  const removeMarker = (id: string) => {
    const newMarkers = markers.filter((marker) => marker.id !== id);
    setMarkers(newMarkers);
    onMarkersChange?.(newMarkers);
  };

  const updateMarkerTime = (id: string, newTime: number) => {
    const newMarkers = markers
      .map((marker) => (marker.id === id ? { ...marker, time: newTime } : marker))
      .sort((a, b) => a.time - b.time);
    setMarkers(newMarkers);
    onMarkersChange?.(newMarkers);
  };

  const handleMarkerMouseDown = (e: React.MouseEvent<HTMLDivElement>, id: string) => {
    e.stopPropagation();
    setDraggingMarkerId(id);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingMarkerId && timelineRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        let x = e.clientX - rect.left;
        if (x < 0) x = 0;
        if (x > rect.width) x = rect.width;
        const newTime = (x / rect.width) * totalTime;
        updateMarkerTime(draggingMarkerId, newTime);
      }
    };
    const handleMouseUp = () => {
      setDraggingMarkerId(null);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingMarkerId, totalTime]);

  const playSegment = () => {
    if (!audioRef.current || markers.length === 0 || !audioUrl) return;
    const current = markers[0];
    const next = markers[1] || { time: totalTime };
    audioRef.current.currentTime = current.time;
    audioRef.current.play();
    const interval = setInterval(() => {
      if (audioRef.current && audioRef.current.currentTime >= next.time) {
        audioRef.current.pause();
        clearInterval(interval);
      }
    }, 100);
  };

  // Tri des marqueurs par temps pour obtenir l'ordre des sections
  const sortedMarkers = [...markers].sort((a, b) => a.time - b.time);

  return (
    <div style={{ padding: "1rem" }}>
      <div
        ref={timelineRef}
        onClick={handleTimelineClick}
        style={{
          position: "relative",
          width: "100%",
          top: "1rem",
          height: `${containerHeight}px`,
          border: "1px solid #ccc",
          marginBottom: "1rem",
          cursor: "crosshair"
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
            pointerEvents: "none"
          }}
        />
        {/* Vignette play pour la toute première section (coin haut gauche) */}
        <div
          style={{
            position: "absolute",
            left: "0%",
            top: "-12px",
            transform: "translateX(-50%)",
            backgroundColor: "green",
            border: "1px solid green",
            borderRadius: "50%",
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "15px",
            color: "#fff",
            cursor: "pointer",
            pointerEvents: "auto",
            zIndex: 10
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (onPlaySection) {
              const sortedMarkers = [...markers].sort((a, b) => a.time - b.time);
              const firstMarkerTime = sortedMarkers.length > 0 ? sortedMarkers[0].time : totalTime;
              onPlaySection({
                id: "first-section",
                start: 0,
                end: firstMarkerTime,
                performanceScore: 0
              });
            }
          }}
        >
          ▶
        </div>
        {/* Triangle violet non déplaçable pour la première section (numéro 1) */}
        <div
          style={{
            position: "absolute",
            left: "0%",
            top: "-28px",
            transform: "translateX(-50%)",
            pointerEvents: "none"
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "15px solid transparent",
              borderRight: "15px solid transparent",
              borderTop: "16px solid #800080",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "-1px",
              left: "3px",
              width: "22px",
              height: "15px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "9px",
              color: "#fff"
            }}
          >
            1
          </div>
        </div>
        {/* Trait rouge indiquant la position de lecture */}
        {typeof currentTime === "number" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${(currentTime / totalTime) * 100}%`,
              width: "1px",
              backgroundColor: "red",
            }}
          />
        )}
        {/* Affichage des marqueurs (triés) */}
        {sortedMarkers.map((marker, index) => {
          const sectionEnd = sortedMarkers[index + 1]?.time || totalTime;
          // Le numéro de section pour ce marqueur est (index + 2) puisque la section 1 est déjà affichée
          const sectionNumber = index + 2;
          return (
            <div
              key={marker.id}
              style={{
                position: "absolute",
                left: `${(marker.time / totalTime) * 100}%`,
                top: 0,
                width: "20px",
                height: "100%",
                transform: "translateX(-50%)",
                pointerEvents: "none"
              }}
            >
              {/* Trait violet indiquant la position du marqueur */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  top: 0,
                  bottom: 0,
                  width: "1px",
                  backgroundColor: "#800080"
                }}
              ></div>
              {/* Triangle violet déplaçable (style d'origine) avec le numéro de section */}
              <div
                style={{
                  position: "absolute",
                  top: "-28px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  cursor: "ew-resize",
                  pointerEvents: "auto"
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMarkerMouseDown(e, marker.id);
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "15px solid transparent",
                    borderRight: "15px solid transparent",
                    borderTop: "16px solid #800080"
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "-1px",
                    left: "3px",
                    width: "22px",
                    height: "15px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "9px",
                    color: "#fff"
                  }}
                >
                  {sectionNumber}
                </div>
              </div>
              {/* Bouton de suppression */}
              <div
                style={{
                  position: "absolute",
                  bottom: "-20px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "#fff",
                  border: "1px solid #ccc",
                  borderRadius: "50%",
                  width: "16px",
                  height: "16px",
                  textAlign: "center",
                  lineHeight: "14px",
                  fontSize: "12px",
                  cursor: "pointer",
                  pointerEvents: "auto"
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  removeMarker(marker.id);
                }}
              >
                ×
              </div>
              {/* Vignette play pour ce marqueur (lancement de la section) */}
              <div
                style={{
                  position: "absolute",
                  top: "-12px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "green",
                  border: "1px solid green",
                  borderRadius: "50%",
                  width: "18px",
                  height: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "9px",
                  color: "#fff",
                  cursor: "pointer",
                  pointerEvents: "auto"
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPlaySection) {
                    onPlaySection({
                      id: marker.id + "-play",
                      start: marker.time,
                      end: sectionEnd,
                      performanceScore: 0
                    });
                  }
                }}
              >
                ▶
              </div>
            </div>
          );
        })}        
      </div>
      {audioUrl ? (
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={playSegment}>Play</button>
          <button onClick={() => {}}>Précédent</button>
          <button onClick={() => {}}>Suivant</button>
          <button onClick={() => audioRef.current?.pause()}>Pause</button>
        </div>
      ) : (
        <div style={{ marginBottom: "1rem", color: "gray" }}></div>
      )}
      {audioUrl && <audio ref={audioRef} />}
    </div>
  );
};

export default AudioTimelineEditor;
