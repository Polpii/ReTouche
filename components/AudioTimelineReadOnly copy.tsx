"use client";
import React, { useEffect, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";

export interface Section {
  id: string;
  start: number; // en secondes
  end: number;   // en secondes
  performanceScore?: number;
}

export interface AudioTimelineReadOnlyProps {
  midiUrl?: string;         // URL du fichier MIDI
  totalTime: number;        // Durée totale en secondes
  containerHeight?: number; // Hauteur du conteneur (par défaut 100px)
  sections: Section[];      // Liste des sections
  onPlaySection: (section: Section) => void; // Callback quand on clique sur une section
  currentTime?: number;     // Position de lecture en secondes
  noteColors?: string[];    // Couleurs par note, optionnel
}

const AudioTimelineReadOnly: React.FC<AudioTimelineReadOnlyProps> = ({
  midiUrl,
  totalTime,
  containerHeight = 100,
  sections,
  onPlaySection,
  currentTime,
  noteColors = []  // Couleur par défaut : vide = rouge par défaut
}) => {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // État pour les marqueurs fusionnés (supprimés)
  const [removedMarkers, setRemovedMarkers] = useState<Set<string>>(new Set());
  
  const toggleMarker = (id: string) => {
    setRemovedMarkers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  useEffect(() => {
    if (!timelineRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = timelineRef.current.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Fond : grille
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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

    // Dessin du piano roll à partir du MIDI
    if (midiUrl) {
      fetch(midiUrl)
        .then((res) => {
          if (!res.ok) throw new Error("Fichier MIDI non trouvé");
          return res.arrayBuffer();
        })
        .then((buffer) => {
          const midi = new Midi(buffer);
          let allNotes: any[] = [];
          midi.tracks.forEach((track) => {
            allNotes = allNotes.concat(track.notes);
          });
          allNotes.sort((a, b) => a.time - b.time);
          allNotes.forEach((note, index) => {
            const x = (note.time / totalTime) * canvas.width;
            const width = (note.duration / totalTime) * canvas.width;
            const minNote = 21, maxNote = 108;
            const noteRange = maxNote - minNote;
            const y = canvas.height - ((note.midi - minNote) / noteRange) * canvas.height;
            const noteHeight = 4;
            ctx.fillStyle = noteColors[index] ? noteColors[index] : "red";
            ctx.fillRect(x, y - noteHeight / 2, width, noteHeight);
          });
        })
        .catch((err) => {
          console.error("Erreur de chargement du MIDI", err);
        });
    }
  }, [midiUrl, totalTime, containerHeight, noteColors]);

  const sortedSections = [...sections].sort((a, b) => a.start - b.start);
  
  // Calculer les groupes fusionnés en considérant que chaque marker (à partir du 2ème élément)
  // correspond à la séparation entre la section précédente et la section courante.
  // Si le marker (section.id) est retiré, la section courante est fusionnée avec le groupe en cours.
  const mergedGroups: Array<{ group: typeof sortedSections, left: number, right: number }> = [];
  if(sortedSections.length > 0){
    let currentGroup = [sortedSections[0]];
    for (let i = 1; i < sortedSections.length; i++) {
      if( removedMarkers.has(sortedSections[i].id) ){
        currentGroup.push(sortedSections[i]);
      } else {
        mergedGroups.push({
          group: currentGroup,
          left: currentGroup[0].start,
          right: currentGroup[currentGroup.length - 1].end,
        });
        currentGroup = [sortedSections[i]];
      }
    }
    mergedGroups.push({
      group: currentGroup,
      left: currentGroup[0].start,
      right: currentGroup[currentGroup.length - 1].end,
    });
  }

  return (
    <div
      ref={timelineRef}
      style={{
        position: "relative",
        left: 0,
        width: "calc(100vw - 2rem)",
        height: `${containerHeight}px`,
        border: "1px solid #ccc",
        marginBottom: "1rem",
        overflow: "visible",
        msOverflowStyle: "none",
        scrollbarWidth: "none",
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
          zIndex: 1,
        }}
      />
      {/* Affichage du fond cliquable pour chaque section */}
      {sortedSections.map((section) => {
        const leftPercent = (section.start / totalTime) * 100;
        const widthPercent = ((section.end - section.start) / totalTime) * 100;
        return (
          <div key={section.id}>
            <div
              onClick={() => onPlaySection(section)}
              style={{
                position: "absolute",
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                height: "100%",
                cursor: "pointer",
                backgroundColor: "transparent",
                zIndex: 2,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `${leftPercent}%`,
                top: 0,
                bottom: 0,
                width: "2px",
                backgroundColor: "#800080",
                opacity: removedMarkers.has(section.id) ? 0.3 : 1,
                pointerEvents: "none",
                zIndex: 2,
              }}
            />
            {/* Bouton de suppression / fusion sous chaque trait violet (pour toutes les sections, y compris la 1ère) */}
            <div
              style={{
                position: "absolute",
                bottom: "-20px",
                left: `${leftPercent}%`,
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
                // Pour le premier marker (index 0), on n'autorise pas la fusion
                if(section === sortedSections[0]) return;
                toggleMarker(section.id);
              }}
            >
              {removedMarkers.has(section.id) ? "⟲" : "×"}
            </div>
          </div>
        );
      })}
      {/* Affichage d'une seule vignette play par groupe fusionné */}
      {mergedGroups.map((groupObj, index) => {
        const { left, right } = groupObj;
        const centerTime = (left + right) / 2;
        const centerPercent = (centerTime / totalTime) * 100;
        // Créez une section virtuelle qui s'étend du début (left) à la fin (right) du groupe fusionné
        const virtualSection: Section = { id: `merged-${index}`, start: left, end: right };
        return (
          <div 
            key={`group-${index}`}
            onClick={() => onPlaySection(virtualSection)}
            style={{
              position: "absolute",
              left: `${centerPercent}%`,
              top: "-32px",
              transform: "translateX(-50%)",
              backgroundColor: "green",
              border: "2px solid green",
              borderRadius: "50%",
              width: "24px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "12px",
              cursor: "pointer",
              zIndex: 3,
            }}
          >
            ▶
          </div>
        );
      })}
      {typeof currentTime === "number" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${(currentTime / totalTime) * 100}%`,
            width: "1px",
            backgroundColor: "red",
            pointerEvents: "none",
            zIndex: 1000,
          }}
        />
      )}
      <style jsx>{`
        ::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default AudioTimelineReadOnly;
