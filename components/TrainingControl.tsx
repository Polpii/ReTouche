// app/components/TrainingControl.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import { evaluatePerformance, NoteEvent } from "./PerformanceEvaluator";
import { Section } from "@/components/types";


interface Sound {
  id: number;
  name: string;
  videoUrl: string;
  midiUrl: string;
  sections: Section[];
}

interface TrainingControlProps {
  section: { id: number; titre: string; debut: number; fin: number };
  playbackSpeed: number;
  sound: Sound;
  onPerformanceEvaluated?: (score: number) => void;
}

const TrainingControl: React.FC<TrainingControlProps> = ({
  section,
  playbackSpeed,
  sound,
  onPerformanceEvaluated,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [performanceScore, setPerformanceScore] = useState<number | null>(null);
  const [learnerNotes, setLearnerNotes] = useState<NoteEvent[]>([]);
  const midiOutputRef = useRef<MIDIOutput | null>(null);
  const midiDataRef = useRef<Midi | null>(null);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const startTimestampRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);

  const loadMidiSection = async () => {
    const res = await fetch(sound.midiUrl);
    const arrayBuffer = await res.arrayBuffer();
    const midi = new Midi(arrayBuffer);
    midiDataRef.current = midi;
    return midi;
  };

  const startTraining = async () => {
    if (!navigator.requestMIDIAccess) {
      console.warn("L'API Web MIDI n'est pas supportée par ce navigateur.");
      return;
    }
    const midiAccess = await navigator.requestMIDIAccess();
    const outputs = Array.from(midiAccess.outputs.values());
    let output = outputs.find(
      (out) =>
        out.name &&
        (out.name.toLowerCase().includes("disklavier") ||
          out.name.toLowerCase().includes("yamaha"))
    );
    if (!output && outputs.length > 0) {
      output = outputs[0];
      console.warn("Port Disklavier non trouvé, utilisation du port :", output.name);
    }
    midiOutputRef.current = output ?? null;

    const midi = await loadMidiSection();
    playSection(midi);
    setIsPlaying(true);
    setIsPaused(false);
    setPerformanceScore(null);
    setLearnerNotes([]);
    startTimestampRef.current = performance.now() - pauseOffsetRef.current;
  };

  const playSection = (midi: Midi) => {
    const sectionStart = section.debut;
    const sectionEnd = section.fin;
    midi.tracks.forEach((track: any) => {
      track.notes.forEach((note: any) => {
        if (note.time >= sectionStart && note.time <= sectionEnd) {
          const adjustedTime =
            ((note.time - sectionStart) * 1000) / playbackSpeed - pauseOffsetRef.current;
          const timeoutId = setTimeout(() => {
            if (midiOutputRef.current) {
              midiOutputRef.current.send([0x90, note.midi, 0x7f]);
              simulateLearnerInput(note);
              setTimeout(() => {
                if (midiOutputRef.current) {
                  midiOutputRef.current.send([0x80, note.midi, 0x40]);
                }
              }, (note.duration * 1000) / playbackSpeed);
            }
          }, adjustedTime);
          timeoutsRef.current.push(timeoutId);
        }
      });
    });
  };

  const simulateLearnerInput = (note: any) => {
    const simulatedTime =
      (performance.now() - startTimestampRef.current) / 1000 + (Math.random() - 0.5) * 0.1;
    const simulatedNote: NoteEvent = {
      midi: note.midi,
      time: simulatedTime,
      duration: note.duration,
    };
    setLearnerNotes((prev) => [...prev, simulatedNote]);
  };

  const pauseTraining = () => {
    timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    timeoutsRef.current = [];
    pauseOffsetRef.current = performance.now() - startTimestampRef.current;
    setIsPaused(true);
    setIsPlaying(false);
  };

  const stopTraining = () => {
    timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    timeoutsRef.current = [];
    pauseOffsetRef.current = 0;
    setIsPlaying(false);
    setIsPaused(false);
    if (midiDataRef.current) {
      const expectedNotes: NoteEvent[] = [];
      midiDataRef.current.tracks.forEach((track: any) => {
        track.notes.forEach((note: any) => {
          if (note.time >= section.debut && note.time <= section.fin) {
            expectedNotes.push({
              midi: note.midi,
              time: note.time - section.debut,
              duration: note.duration,
            });
          }
        });
      });
      const score = evaluatePerformance(expectedNotes, learnerNotes);
      setPerformanceScore(score);
      if (onPerformanceEvaluated) onPerformanceEvaluated(score);
    }
  };

  return (
    <div style={{ border: "1px solid #ccc", padding: "1rem", marginTop: "1rem" }}>
      <h3>
        {section.titre} (de {section.debut}s à {section.fin}s)
      </h3>
      <div>
        <button onClick={startTraining} disabled={isPlaying}>
          {isPaused ? "Reprendre" : "Démarrer"}
        </button>
        <button onClick={pauseTraining} disabled={!isPlaying}>
          Pause
        </button>
        <button onClick={stopTraining} disabled={!isPlaying && !isPaused}>
          Arrêter
        </button>
      </div>
      <div style={{ marginTop: "1rem" }}>
        <strong>Vitesse de lecture :</strong> {playbackSpeed}x
      </div>
      {performanceScore !== null && (
        <div style={{ marginTop: "1rem" }}>
          <strong>Score de performance :</strong> {performanceScore.toFixed(2)}
        </div>
      )}
    </div>
  );
};

export default TrainingControl;
