"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSoundContext, Sound, Section } from "../../../context/SoundContext";
import AudioTimelineEditor, { Marker } from "../../../../components/AudioTimelineEditor";
import VideoPortal from "../../../../components/VideoPortal";

export default function EditorPage() {
  const params = useParams();
  const soundId = params.id as string;
  const { sounds, updateSound, deleteSound } = useSoundContext();
  const [sound, setSound] = useState<Sound | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const totalTime = 180; // durée par défaut
  const [initialized, setInitialized] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Second screen state
  const [secondScreenEnabled, setSecondScreenEnabled] = useState(false);
  const secondScreenAudioRef = useRef<HTMLAudioElement | null>(null);

  // Calcul de la hauteur de l'éditeur audio en fonction de la hauteur de la fenêtre.
  // On suppose ici que le header (Home, Pause, titre) et la ligne de sections occupent environ 160px.
  const [timelineHeight, setTimelineHeight] = useState(400);
  useEffect(() => {
    const handleResize = () => {
      setTimelineHeight(window.innerHeight - 160);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!initialized) {
      const found = sounds.find((s) => s.id === soundId);
      if (found) {
        setSound(found);
        // Filtrer pour éviter d'ajouter un marker à 0s
        const initialMarkers = found.sections
          .filter((section) => section.start > 0)
          .map((section) => ({
            id: section.id,
            time: section.start,
            note: ""
          }));
        setMarkers(initialMarkers);
        recalcSections(initialMarkers);
      }
      setInitialized(true);
    }
  }, [soundId, sounds, initialized]);

  // Recalcule les sections (nombre de sections = markers.length + 1)
  const recalcSections = (updatedMarkers: Marker[]) => {
    const sorted = [...updatedMarkers].sort((a, b) => a.time - b.time);
    let newSections: Section[] = [];
    if (sorted.length === 0) {
      newSections.push({ id: "default", start: 0, end: totalTime, performanceScore: 0 });
    } else {
      newSections.push({
        id: sorted[0].id + "-sec0",
        start: 0,
        end: sorted[0].time,
        performanceScore: 0,
      });
      for (let i = 1; i < sorted.length; i++) {
        newSections.push({
          id: sorted[i - 1].id + "-" + sorted[i].id,
          start: sorted[i - 1].time,
          end: sorted[i].time,
          performanceScore: 0,
        });
      }
      newSections.push({
        id: sorted[sorted.length - 1].id + "-last",
        start: sorted[sorted.length - 1].time,
        end: totalTime,
        performanceScore: 0,
      });
    }
    setSections(newSections);
    if (sound) {
      const updatedSound = { ...sound, sections: newSections };
      setSound(updatedSound);
      updateSound(updatedSound);
    }
  };

  const handleMarkersChange = (updatedMarkers: Marker[]) => {
    setMarkers(updatedMarkers);
    recalcSections(updatedMarkers);
  };

  // Mise à jour du curseur de lecture en temps réel
  const startCursorInterval = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
    }, 100);
  };

  const stopCursorInterval = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Fonction qui lance ou reprend la lecture depuis la position actuelle jusqu'à la fin de la section en cours
  const handlePlayOrResume = () => {
    if (!sound?.audioUrl || !audioRef.current) return;
    const current = audioRef.current.currentTime;
    // Recherche la section correspondant à la position actuelle
    let currentSection = sections.find((section) => current >= section.start && current < section.end);
    if (!currentSection) {
      // Si aucune section n'est trouvée, on recherche la prochaine section
      currentSection = sections.find((section) => section.start > current);
      if (currentSection) {
        audioRef.current.currentTime = currentSection.start;
        // Synchroniser le deuxième écran
        if (secondScreenEnabled && secondScreenAudioRef.current) {
          secondScreenAudioRef.current.currentTime = currentSection.start;
        }
      } else {
        return;
      }
    }
    audioRef.current
      .play()
      .then(() => {
        startCursorInterval();
        // Synchroniser le deuxième écran
        if (secondScreenEnabled && secondScreenAudioRef.current) {
          secondScreenAudioRef.current.play().catch(err => console.error("Second screen playback error", err));
        }
      })
      .catch((err) => console.error("Playback error", err));
    const interval = setInterval(() => {
      if (audioRef.current && audioRef.current.currentTime >= currentSection!.end) {
        audioRef.current.pause();
        // Arrêter aussi le son sur le deuxième écran
        if (secondScreenEnabled && secondScreenAudioRef.current) {
          secondScreenAudioRef.current.pause();
        }
        clearInterval(interval);
        stopCursorInterval();
      }
    }, 100);
  };

  const handlePlaySection = (section: Section) => {
    if (sound?.audioUrl && audioRef.current) {
      audioRef.current.src = sound.audioUrl;
      audioRef.current.load();
      audioRef.current.currentTime = section.start;
      // Synchroniser le deuxième écran
      if (secondScreenEnabled && secondScreenAudioRef.current) {
        secondScreenAudioRef.current.src = sound.audioUrl;
        secondScreenAudioRef.current.load();
        secondScreenAudioRef.current.currentTime = section.start;
      }
      audioRef.current
        .play()
        .then(() => {
          startCursorInterval();
          // Synchroniser le deuxième écran
          if (secondScreenEnabled && secondScreenAudioRef.current) {
            secondScreenAudioRef.current.play().catch(err => console.error("Second screen playback error", err));
          }
        })
        .catch((err) => console.error("Playback error", err));
      const interval = setInterval(() => {
        if (audioRef.current && audioRef.current.currentTime >= section.end) {
          audioRef.current.pause();
          // Arrêter aussi le son sur le deuxième écran
          if (secondScreenEnabled && secondScreenAudioRef.current) {
            secondScreenAudioRef.current.pause();
          }
          clearInterval(interval);
          stopCursorInterval();
        }
      }, 100);
    }
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      // Synchroniser le deuxième écran
      if (secondScreenEnabled && secondScreenAudioRef.current) {
        secondScreenAudioRef.current.pause();
      }
      stopCursorInterval();
    }
  };

  // Fonction pour activer/désactiver le deuxième écran
  const toggleSecondScreen = () => {
    setSecondScreenEnabled(!secondScreenEnabled);
  };

  return (
    <div
      style={{
        backgroundColor: "#f0f0f0",
        padding: "1rem",
        fontFamily: "Arial, sans-serif",
        maxWidth: "100vw",
        height: "100vh",
        overflow: "hidden", // Désactive tout scroll
        position: "fixed", // Empêche le scroll du body
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    >
      {sound ? (
        <>
          {/* Header : Boutons Home, Pause, Play et titre centré */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem"
            }}
          >
            <div style={{ position: "absolute", left: 0, display: "flex", gap: "0.5rem" }}>
              <Link href="/teacher_admin">
                <button
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#0070f3",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "0.9rem",
                    cursor: "pointer"
                  }}
                >
                  Back
                </button>
              </Link>
              <button
                onClick={handlePause}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#ff5c5c",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "0.9rem",
                  cursor: "pointer"
                }}
              >
                ⏸
              </button>
              <button
                onClick={handlePlayOrResume}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "green",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "0.9rem",
                  cursor: "pointer"
                }}
              >
                ▶
              </button>
            </div>
            <h1 style={{ margin: 0, fontSize: "1.5rem", textAlign: "center" }}>
              Editing: {sound.title}
            </h1>
          </div>
          {/* L'ancienne ligne des sections (boutons bleus) a été retirée car les numéros s'affichent dans les triangles violets */}
          {/* Éditeur audio prenant toute la largeur */}
          <div style={{ marginBottom: "1rem", width: "100%" }}>
            <AudioTimelineEditor
              midiUrl={sound.midiUrl}
              totalTime={totalTime}
              initialMarkers={markers}
              onMarkersChange={handleMarkersChange}
              containerHeight={timelineHeight}
              currentTime={currentTime}
              onPlaySection={(section: Section) => {
                handlePlaySection(section);
              }}
            />
          </div>
          {sound.audioUrl && (
            <audio ref={audioRef} src={sound.audioUrl} style={{ width: "100%" }} />
          )}

          {/* Portail vers le deuxième écran */}
          {secondScreenEnabled && (
            <VideoPortal width={1280} height={720}>
              <div style={{ width: "100%", height: "100%", position: "relative", background: "#000" }}>
                {/* Titre en haut de la fenêtre */}
                <div style={{ 
                  position: "absolute", 
                  top: "10px", 
                  left: "0", 
                  width: "100%", 
                  textAlign: "center",
                  color: "white",
                  fontSize: "24px",
                  fontWeight: "bold",
                  textShadow: "2px 2px 4px rgba(0,0,0,0.5)"
                }}>
                  {sound.title}
                </div>
                
                {/* Audio pour le deuxième écran (invisible mais fonctionnel) */}
                {sound.audioUrl && (
                  <audio ref={secondScreenAudioRef} src={sound.audioUrl} style={{ display: "none" }} />
                )}
              </div>
            </VideoPortal>
          )}
        </>
      ) : (
        <p style={{ fontSize: "0.9rem" }}>Sound not found</p>
      )}
    </div>
  );
}
