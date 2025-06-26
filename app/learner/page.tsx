"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLearnerContext } from "../context/LearnerContext";

export default function LearnerProfilePage() {
  const router = useRouter();
  const { learners, addLearner } = useLearnerContext();
  const [newName, setNewName] = useState("");

  const handleCreate = () => {
    if (newName.trim() !== "") {
      // Ajoute le nouveau learner
      addLearner(newName.trim());
      // Redirige vers /learner/select-sound
      router.push("/learner/select-sound");
    }
  };

  return (
    <div style={{ padding: "1rem", fontFamily: "Arial, sans-serif", width: "100%" }}>
      {/* Bouton Home */}
      <Link href="/">
        <button
          style={{
            backgroundColor: "#0070f3",
            color: "#fff",
            border: "none",
            padding: "1rem 2rem",
            fontSize: "1.5rem",
            borderRadius: "4px",
            cursor: "pointer",
            marginBottom: "1rem",
          }}
        >
          Home
        </button>
      </Link>

      <h3 style={{ color: "#fff", fontSize: "1.5rem", marginBottom: "2rem" }}>Learner Profiles</h3>

      {/* Formulaire pour créer un nouveau profil */}
      <div style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Enter new learner name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{
            padding: "1.5rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            marginRight: "0.5rem",
          }}
        />
        <button
          onClick={handleCreate}
          style={{
            backgroundColor: "#28a745",
            color: "#fff",
            border: "none",
            padding: "1rem 2rem",
            fontSize: "1.5rem",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Create
        </button>
      </div>

      {/* Liste des profils existants */}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {learners.map((learner) => (
          <li key={learner.name} style={{ marginBottom: "2rem" }}>
            <button
              onClick={() => {
                // On pourrait stocker le learner sélectionné dans un context 
                // ou dans localStorage, si besoin.
                router.push("/learner/select-sound");
              }}
              style={{
                padding: "1rem 2rem",
                fontSize: "1.5rem",
                cursor: "pointer",
                border: "1px solid #0070f3",
                backgroundColor: "#fff",
                borderRadius: "4px",
                color: "#0070f3",
              }}
            >
              {learner.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
