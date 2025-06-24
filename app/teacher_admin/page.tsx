"use client";

import React, { useState } from "react";
import { useSoundContext, Sound } from "../context/SoundContext";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";

export default function TeacherListPage() {
  const { sounds, addSound, deleteSound } = useSoundContext();
  const [title, setTitle] = useState("");

  const handleCreateSound = () => {
    if (!title) {
      alert("Veuillez entrer un titre.");
      return;
    }
    // Les fichiers doivent se trouver dans le dossier public: [title].mp4, [title].mid, [title].mp3
    const newSound: Sound = {
      id: uuidv4(),
      title,
      videoUrl: `/${title}.mp4`,
      midiUrl: `/${title}.mid`,
      audioUrl: `/${title}.mp3`,
      sections: []
    };
    addSound(newSound);
    setTitle("");
  };

  return (
    <div
      style={{
        backgroundColor: "#fff",
        padding: "2rem",
        fontFamily: "Arial, sans-serif",
        maxWidth: "800px",
        margin: "0 auto",
        height: "100vh",
        overflowY: "auto",
      }}
    >
      <Link href="/">
        <button
          style={{
            backgroundColor: "#0070f3",
            color: "#fff",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            cursor: "pointer",
            marginBottom: "1rem"
          }}
        >
          Home
        </button>
      </Link>
      <h4 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Add a song</h4>
      <div style={{ marginBottom: "2rem" }}>
        <label style={{ fontSize: "0.9rem" }}>
          {"Song Title: "}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nom du son"
            style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
          />
        </label>
        <p style={{ fontSize: "0.8rem" }}>
          Make sure the files <code>{`${title}.mp4`}</code>, <code>{`${title}.mid`}</code> and <code>{`${title}.mp3`}</code> are in the database.
        </p>
        <button
          onClick={handleCreateSound}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#28a745",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          Create song
        </button>
      </div>
      <h4 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>List songs</h4>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {sounds.map((sound) => (
          <li
            key={sound.id}
            style={{
              color: "#fff",
              marginBottom: "1rem",
              border: "1px solid #ccc",
              padding: "0.5rem",
              borderRadius: "4px"
            }}
          >
            <strong>{sound.title}</strong>
            <div style={{ marginTop: "0.5rem" }}>
              <Link href={`/teacher_admin/editor/${sound.id}`}>
                <button
                  style={{
                    marginRight: "0.5rem",
                    padding: "0.3rem 0.6rem",
                    backgroundColor: "#0070f3",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.8rem"
                  }}
                >
                  Edit
                </button>
              </Link>
              <button
                onClick={() => deleteSound(sound)}
                style={{
                  padding: "0.3rem 0.6rem",
                  backgroundColor: "#dc3545",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.8rem"
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
