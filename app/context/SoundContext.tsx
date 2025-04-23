// app/context/SoundContext.tsx
"use client";
import React, { createContext, useState, useEffect, useContext } from "react";
import { 
  getAllSounds, 
  addSound as addSoundToFirebase, 
  updateSound as updateSoundInFirebase, 
  deleteSoundWithoutFiles
} from "../services/mediaService";
import { getContentUrl } from "../services/contentService";

export interface Section {
  id: string;
  start: number;
  end: number;
  performanceScore?: number;
}

export interface Annotation {
  id: string;
  timestamp: number;
  color: string;
  // Add any other properties your annotations might have
  text?: string;
  duration?: number;
}

export interface Sound {
  id: string;
  title: string;
  audioUrl: string;   // Pour lecture audio (si disponible)
  videoUrl: string;
  midiUrl?: string;   // Pour le fichier MIDI (obtenu via [titre].mid)
  sections: Section[];
  calibration?: any;  // Données de calibration (points de transformation)
  annotations?: Annotation[]; // Add annotations property to the Sound interface
}

interface SoundContextProps {
  sounds: Sound[];
  loading: boolean;
  error: string | null;
  addSound: (sound: Omit<Sound, 'id'>) => Promise<void>;
  updateSound: (sound: Sound) => Promise<void>;
  deleteSound: (sound: Sound) => Promise<void>;
}

const SoundContext = createContext<SoundContextProps | undefined>(undefined);

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch sounds from Firebase on component mount
  useEffect(() => {
    async function fetchSounds() {
      try {
        setLoading(true);
        const data = await getAllSounds();
        
        // Process sounds to ensure they have valid URLs from Firebase Storage
        const processedSounds = await Promise.all(data.map(async (sound) => {
          // If URLs are already Firebase Storage URLs, use them directly
          if (sound.videoUrl?.includes('firebase') && 
              sound.audioUrl?.includes('firebase') && 
              sound.midiUrl?.includes('firebase')) {
            return sound;
          }
          
          // Otherwise, try to get them from Firebase Storage
          try {
            const processedSound = { ...sound };
            
            // Convert relative paths to Firebase Storage URLs
            if (sound.videoUrl && !sound.videoUrl.includes('firebase')) {
              const videoPath = sound.videoUrl.replace(/^\//, ''); // Remove leading slash
              processedSound.videoUrl = await getContentUrl(videoPath);
            }
            
            if (sound.audioUrl && !sound.audioUrl.includes('firebase')) {
              const audioPath = sound.audioUrl.replace(/^\//, '');
              processedSound.audioUrl = await getContentUrl(audioPath);
            }
            
            if (sound.midiUrl && !sound.midiUrl.includes('firebase')) {
              const midiPath = sound.midiUrl.replace(/^\//, '');
              processedSound.midiUrl = await getContentUrl(midiPath);
            }
            
            return processedSound;
          } catch (err) {
            console.warn(`Some media content couldn't be loaded for sound: ${sound.title}`, err);
            return sound; // Return original sound if we can't process it
          }
        }));
        
        setSounds(processedSounds);
        setError(null);
      } catch (err) {
        console.error("Error fetching sounds:", err);
        setError("Failed to load sounds data");
      } finally {
        setLoading(false);
      }
    }

    fetchSounds();
  }, []);

  // Add a new sound
  const addSound = async (soundData: Omit<Sound, 'id'>) => {
    try {
      setLoading(true);
      const newSound = await addSoundToFirebase(soundData);
      setSounds((prev) => [...prev, newSound]);
      setError(null);
    } catch (err) {
      console.error("Error adding sound:", err);
      setError("Failed to add sound");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Update existing sound
  const updateSound = async (sound: Sound) => {
    try {
      setLoading(true);
      await updateSoundInFirebase(sound);
      setSounds((prev) => prev.map((s) => (s.id === sound.id ? sound : s)));
      setError(null);
    } catch (err) {
      console.error("Error updating sound:", err);
      setError("Failed to update sound");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Delete a sound
  const deleteSound = async (sound: Sound) => {
    try {
      setLoading(true);
      await deleteSoundWithoutFiles(sound);
      setSounds((prev) => prev.filter((s) => s.id !== sound.id));
      setError(null);
    } catch (err) {
      console.error("Error deleting sound:", err);
      setError("Failed to delete sound");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <SoundContext.Provider value={{ sounds, loading, error, addSound, updateSound, deleteSound }}>
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
