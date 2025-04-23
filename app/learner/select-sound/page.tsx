"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSoundContext } from "../../context/SoundContext";
import { useLearnerContext } from "../../context/LearnerContext";

export default function SelectSoundPage() {
  const router = useRouter();
  const { sounds } = useSoundContext();
  const { currentLearnerName } = useLearnerContext();

  const [redirecting, setRedirecting] = useState(false);

  // Si pas de learner, on redirige via useEffect
  useEffect(() => {
    if (!currentLearnerName) {
      router.push("/learner/profile");
      setRedirecting(true);
    }
  }, [currentLearnerName, router]);

  // Tant qu’on n’a pas de learner, ou qu’on est en train de rediriger,
  // on ne rend rien (ou un "Loading...")
  if (!currentLearnerName || redirecting) {
    return null;
  }

  return (
    <div style={{ padding: "1rem", fontFamily: "Arial, sans-serif" }}>
      {/* Bouton pour revenir au choix de profil */}
      <Link href="/learner/profile">
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
          Back to Profiles
        </button>
      </Link>

      <h3>Select a Sound</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {sounds.map((sound) => (
          <li key={sound.id} style={{ marginBottom: "0.5rem" }}>
            <button
              onClick={() => {
                router.push(`/learner/training?soundId=${sound.id}`);
              }}
              style={{
                padding: "0.5rem 1rem",
                cursor: "pointer",
                border: "1px solid #0070f3",
                backgroundColor: "#fff",
                borderRadius: "4px",
                color: "#0070f3",
              }}
            >
              {sound.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
