"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLearnerContext } from "../../context/LearnerContext";

export default function LearnerProfilePage() {
  const router = useRouter();
  const { learners, addLearner, selectLearner } = useLearnerContext();
  const [newName, setNewName] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleCreate = async () => {
    if (newName.trim() !== "") {
      await addLearner(newName.trim());
      setNewName("");
      setSuccessMessage(`Profile "${newName.trim()}" created successfully!`);
      
      // Effacer le message après quelques secondes
      setTimeout(() => {
        setSuccessMessage("");
      }, 3000);
    }
  };

  const handleSelect = (name: string) => {
    selectLearner(name);
    router.push("/learner/select-sound");
  };

  return (
    <div style={{ padding: "1rem", fontFamily: "Arial, sans-serif" }}>
      {/* Bouton Home */}
      <Link href="/">
        <button
          style={{
            backgroundColor: "#0070f3",
            color: "#fff",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            cursor: "pointer",
            marginBottom: "1rem",
          }}
        >
          Home
        </button>
      </Link>

      <h3 style={{ marginBottom: "1rem" }}>Learner Profiles</h3>

      {/* Formulaire pour créer un nouveau Learner */}
      <div style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Enter new learner name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{
            padding: "0.5rem",
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
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Create
        </button>
      </div>

      {successMessage && (
        <div style={{
          padding: "0.5rem",
          backgroundColor: "#d4edda",
          color: "#155724",
          borderRadius: "4px",
          marginTop: "1rem",
          marginBottom: "1rem"
        }}>
          {successMessage}
        </div>
      )}

      {/* Liste des profils existants */}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {learners.map((learner) => (
          <li key={learner.name} style={{ marginBottom: "0.5rem" }}>
            <button
              onClick={() => handleSelect(learner.name)}
              style={{
                padding: "0.5rem 1rem",
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
