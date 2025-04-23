"use client";
import React, { createContext, useState, useContext, useEffect } from "react";

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
  addLearner: (name: string) => Promise<void>;
  selectLearner: (name: string) => void;
  updateLearner: (learner: Learner) => Promise<void>;
}

const LearnerContext = createContext<LearnerContextValue>({
  learners: [],
  currentLearnerName: null,
  addLearner: async () => {},
  selectLearner: () => {},
  updateLearner: async () => {},
});

export function LearnerProvider({ children }: { children: React.ReactNode }) {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [currentLearnerName, setCurrentLearnerName] = useState<string | null>(null);

  // Charger les learners depuis l'API au montage
  useEffect(() => {
    async function fetchLearners() {
      try {
        const res = await fetch("/api/learners");
        if (res.ok) {
          const data = await res.json();
          setLearners(data);
        }
      } catch (e) {
        console.error("Failed to load learners", e);
      }
    }
    fetchLearners();
  }, []);

  const addLearner = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!learners.find((l) => l.name === trimmed)) {
      const newLearner: Learner = { name: trimmed, recordings: [], evaluations: {} };
      try {
        const res = await fetch("/api/learners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newLearner),
        });
        if (res.ok) {
          const created = await res.json();
          setLearners([...learners, created]);
        }
      } catch (e) {
        console.error("Failed to add learner", e);
      }
    }
    setCurrentLearnerName(trimmed);
  };

  const updateLearner = async (learner: Learner) => {
    try {
      const res = await fetch(`/api/learners/${learner.name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(learner),
      });
      if (res.ok) {
        setLearners(learners.map((l) => (l.name === learner.name ? learner : l)));
      }
    } catch (e) {
      console.error("Failed to update learner", e);
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
      value={{ learners, currentLearnerName, addLearner, selectLearner, updateLearner }}
    >
      {children}
    </LearnerContext.Provider>
  );
}

export function useLearnerContext() {
  return useContext(LearnerContext);
}
