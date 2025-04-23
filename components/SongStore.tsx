"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Points } from "./PerspectiveTransform";
import { nanoid } from "nanoid"; // npm i nanoid

interface SongSection {
  id: string;
  startTime: number;
  endTime: number;
}

interface Song {
  id: string;
  title: string;
  videoUrl: string;  // URL de la vidéo
  midiUrl: string;   // URL du fichier MIDI
  sections: SongSection[];
  calibration: Points; // Données de calibration
  performanceScore: number | null;
}

interface SongContextValue {
  songs: Song[];
  addSong: (title: string) => string; // retourne l'ID du nouveau morceau
  updateSongSections: (songId: string, sections: SongSection[]) => void;
  setSongVideoAndMidi: (songId: string, videoUrl: string, midiUrl: string) => void;
  updateSongCalibration: (songId: string, calibration: Points) => void;
  updateSongPerformanceScore: (songId: string, score: number) => void;
  updateSongSelectedSections: (songId: string, newSections: SongSection[]) => void;
}

const SongContext = createContext<SongContextValue>({
  songs: [],
  addSong: () => "",
  updateSongSections: () => {},
  setSongVideoAndMidi: () => {},
  updateSongCalibration: () => {},
  updateSongPerformanceScore: () => {},
  updateSongSelectedSections: () => {},
});

export function SongProvider({ children }: { children: React.ReactNode }) {
  const [songs, setSongs] = useState<Song[]>([]);

  // Chargement depuis localStorage
  useEffect(() => {
    const stored = localStorage.getItem("songsData");
    if (stored) {
      try {
        setSongs(JSON.parse(stored));
      } catch (error) {
        console.error("Erreur de parsing du localStorage songsData :", error);
      }
    }
  }, []);

  // Sauvegarde dans localStorage à chaque modification
  useEffect(() => {
    localStorage.setItem("songsData", JSON.stringify(songs));
  }, [songs]);

  const addSong = (title: string) => {
    const newSong: Song = {
      id: nanoid(),
      title,
      videoUrl: "",
      midiUrl: "",
      sections: [],
      calibration: {
        topLeft: { x: 0, y: 0 },
        topRight: { x: 300, y: 0 },
        bottomRight: { x: 300, y: 200 },
        bottomLeft: { x: 0, y: 200 },
      },
      performanceScore: null,
    };
    setSongs((prev) => [...prev, newSong]);
    return newSong.id;
  };

  const updateSongSections = (songId: string, sections: SongSection[]) => {
    setSongs((prev) =>
      prev.map((song) =>
        song.id === songId ? { ...song, sections } : song
      )
    );
  };

  const setSongVideoAndMidi = (songId: string, videoUrl: string, midiUrl: string) => {
    setSongs((prev) =>
      prev.map((song) =>
        song.id === songId ? { ...song, videoUrl, midiUrl } : song
      )
    );
  };

  const updateSongCalibration = (songId: string, calibration: Points) => {
    setSongs((prev) =>
      prev.map((song) =>
        song.id === songId ? { ...song, calibration } : song
      )
    );
  };

  const updateSongPerformanceScore = (songId: string, score: number) => {
    // Ce score n’est pas affiché à l’élève, mais stocké pour éventuellement ajuster la vitesse
    setSongs((prev) =>
      prev.map((song) =>
        song.id === songId ? { ...song, performanceScore: score } : song
      )
    );
  };

  const updateSongSelectedSections = (songId: string, newSections: SongSection[]) => {
    setSongs((prev) =>
      prev.map((song) =>
        song.id === songId ? { ...song, sections: newSections } : song
      )
    );
  };

  return (
    <SongContext.Provider
      value={{
        songs,
        addSong,
        updateSongSections,
        setSongVideoAndMidi,
        updateSongCalibration,
        updateSongPerformanceScore,
        updateSongSelectedSections,
      }}
    >
      {children}
    </SongContext.Provider>
  );
}

export function useSongStore() {
  return useContext(SongContext);
}
