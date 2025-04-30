"use client";
import React, { createContext, useState, useContext, useEffect } from "react";
import { 
  getAllLearners, 
  addLearner as addLearnerToFirebase, 
  updateLearner as updateLearnerInFirebase 
} from "../services/mediaService";

export interface Recording {
  name: string;
  videoUrl: string;
  midiUrl: string;
  notes?: string; // nouvelle propriété pour sauvegarder les notes
}

export interface Learner {
  name: string;
  recordings: Recording[];
  // Ajout de la propriété pour sauvegarder les évaluations : soundId -> sectionIndex -> couleurs
  evaluations?: { [soundId: string]: { [sectionIndex: number]: string[] } };
}

interface LearnerContextValue {
  learners: Learner[];
  currentLearnerName: string | null;
  loading: boolean;
  error: string | null;
  addLearner: (name: string) => Promise<void>;
  selectLearner: (name: string) => void;
  updateLearner: (learner: Learner) => Promise<void>;
}

const LearnerContext = createContext<LearnerContextValue>({
  learners: [],
  currentLearnerName: null,
  loading: false,
  error: null,
  addLearner: async () => {},
  selectLearner: () => {},
  updateLearner: async () => {},
});

export function LearnerProvider({ children }: { children: React.ReactNode }) {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [currentLearnerName, setCurrentLearnerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger les learners depuis Firebase au montage
  useEffect(() => {
    async function fetchLearners() {
      try {
        setLoading(true);
        const data = await getAllLearners();
        setLearners(data as Learner[]);
        setError(null);
      } catch (e) {
        console.error("Failed to load learners", e);
        setError("Failed to load learners");
      } finally {
        setLoading(false);
      }
    }
    fetchLearners();
  }, []);

  const addLearner = async (name: string) => {
    try {
      setLoading(true);
      const trimmed = name.trim();
      if (!trimmed) return;
      
      if (!learners.find((l) => l.name === trimmed)) {
        const newLearner: Learner = { name: trimmed, recordings: [], evaluations: {} };
        await addLearnerToFirebase(newLearner);
        setLearners([...learners, newLearner]);
      }
      setCurrentLearnerName(trimmed);
      setError(null);
    } catch (e) {
      console.error("Failed to add learner", e);
      setError("Failed to add learner");
    } finally {
      setLoading(false);
    }
  };

  const updateLearner = async (learner: Learner) => {
    try {
      setLoading(true);
      await updateLearnerInFirebase(learner);
      setLearners(learners.map((l) => (l.name === learner.name ? learner : l)));
      setError(null);
    } catch (e) {
      console.error("Failed to update learner", e);
      setError("Failed to update learner");
    } finally {
      setLoading(false);
    }
  };

  const selectLearner = (name: string) => {
    setCurrentLearnerName(name);
    localStorage.setItem("currentLearnerName", name);
  };

  useEffect(() => {
    const stored = localStorage.getItem("currentLearnerName");
    if (stored) {
      setCurrentLearnerName(stored);
    }
  }, []);

  return (
    <LearnerContext.Provider
      value={{ learners, currentLearnerName, loading, error, addLearner, selectLearner, updateLearner }}
    >
      {children}
    </LearnerContext.Provider>
  );
}

export function useLearnerContext() {
  return useContext(LearnerContext);
}
