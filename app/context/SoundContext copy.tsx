// app/context/SoundContext.tsx
"use client";
import React, { createContext, useState, useEffect, useContext } from "react";

export interface Section {
  id: string;
  start: number;
  end: number;
  performanceScore?: number;
}

export interface Sound {
  id: string;
  title: string;
  audioUrl: string;   // Pour lecture audio (si disponible)
  videoUrl: string;
  midiUrl?: string;   // Pour le fichier MIDI (obtenu via [titre].mid)
  sections: Section[];
  calibration?: any;  // Données de calibration (points de transformation)
}

interface SoundContextProps {
  sounds: Sound[];
  addSound: (sound: Sound) => Promise<void>;
  updateSound: (sound: Sound) => Promise<void>;
  deleteSound: (id: string) => Promise<void>;
}

const SoundContext = createContext<SoundContextProps | undefined>(undefined);

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sounds, setSounds] = useState<Sound[]>([]);

  // Au montage, récupérer les sons via l'API
  useEffect(() => {
    async function fetchSounds() {
      try {
        const res = await fetch("/api/sounds");
        if (!res.ok) {
          throw new Error("Erreur lors de la récupération des sons");
        }
        const data = await res.json();
        setSounds(data);
      } catch (error) {
        console.error(error);
      }
    }
    fetchSounds();
  }, []);

  const addSound = async (sound: Sound) => {
    try {
      const res = await fetch("/api/sounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sound),
      });
      if (!res.ok) {
        throw new Error("Erreur lors de l'ajout du son");
      }
      const newSound = await res.json();
      setSounds((prev) => [...prev, newSound]);
    } catch (error) {
      console.error(error);
    }
  };

  const updateSound = async (sound: Sound) => {
    try {
      const res = await fetch(`/api/sounds/${sound.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sound),
      });
      if (!res.ok) {
        throw new Error("Erreur lors de la mise à jour du son");
      }
      setSounds((prev) =>
        prev.map((s) => (s.id === sound.id ? sound : s))
      );
    } catch (error) {
      console.error(error);
    }
  };

  const deleteSound = async (id: string) => {
    try {
      const res = await fetch(`/api/sounds/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Erreur lors de la suppression du son");
      }
      setSounds((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <SoundContext.Provider value={{ sounds, addSound, updateSound, deleteSound }}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSoundContext = () => {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error("useSoundContext must be used within a SoundProvider");
  }
  return context;
};
