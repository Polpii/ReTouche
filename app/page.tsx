"use client";
import Link from "next/link";

export default function HomePage() {
  return (
    <div
      style={{
        padding: "2rem",
        textAlign: "center",
        fontFamily: "Arial, sans-serif",
        maxWidth: "800px",
        margin: "0 auto"
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        Piano Learning Platform
      </h1>
      <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "center", gap: "1rem" }}>
        <Link href="/learner">
          <button
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#0070f3",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Learner Interface
          </button>
        </Link>
      </div>
    </div>
  );
}
