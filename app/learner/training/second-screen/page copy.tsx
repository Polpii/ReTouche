// app/learner/training/second-screen/page.tsx
"use client";

import React, { useEffect, useState, useRef, CSSProperties, SyntheticEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useSoundContext } from "../../../context/SoundContext";
import { useLearnerContext } from "../../../context/LearnerContext";
import PerspectiveTransform, { Points } from "../../../../components/PerspectiveTransform";
import ContentMedia from "../../../../components/ContentMedia";
import { getCalibrationConfig, CalibrationConfig } from "../../../services/calibrationService";

type MessageData =
  | { type: "SHOW_DEFAULT";     url: string }
  | { type: "SHOW_PERFORMANCE"; url: string }
  | { type: "SHOW_RECORDED";    url: string }
  | { type: "PLAY_SECTION";     start: number; end: number }
  | { type: "TOGGLE_EDIT";      editable: boolean }
  | { type: "SET_SPEED";        speed: number };

export default function SecondScreen() {
  const [speed, setSpeed] = useState<number>(1);
  const params            = useSearchParams();
  const soundId           = params.get("soundId") || "";
  const { sounds }        = useSoundContext();
  const { currentLearnerName } = useLearnerContext();

  const [mode, setMode]         = useState<"default"|"performance"|"recorded">("default");
  const [editable, setEditable] = useState<boolean>(false);

  const defaultVideoUrl = sounds.find(s => s.id === soundId)?.videoUrl;
  const [videoUrl, setVideoUrl] = useState<string|undefined>(defaultVideoUrl);

  const storageKey = `calibration-${soundId}`;
  const [calConfig, setCalConfig] = useState<CalibrationConfig|null>(null);
  const [sharedPoints, setSharedPoints] = useState<Points|null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // 1) Charger la config de calibration
  useEffect(() => {
    getCalibrationConfig(storageKey)
      .then(cfg => {
        if (cfg) setCalConfig(cfg);
        else {
          const raw = localStorage.getItem(storageKey);
          if (raw) setCalConfig(JSON.parse(raw));
        }
      })
      .catch(() => {
        const raw = localStorage.getItem(storageKey);
        if (raw) setCalConfig(JSON.parse(raw));
      });
  }, [storageKey]);

  // 2) Récupérer sharedPoints dès qu’on a la config
  useEffect(() => {
    if (calConfig) {
      setSharedPoints(calConfig.normalizedPoints);
    }
  }, [calConfig]);

  // 3) Gérer les messages de la fenêtre principale
  useEffect(() => {
    function handler(e: MessageEvent) {
      const msg = e.data as MessageData;
      switch (msg.type) {
        case "SET_SPEED":
          setSpeed(msg.speed);
          break;

        case "SHOW_DEFAULT":
          setMode("default");
          setVideoUrl(msg.url);
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.pause();
              videoRef.current.currentTime = 0;
            }
          }, 0);
          break;

        case "SHOW_PERFORMANCE":
          setMode("performance");
          setVideoUrl(msg.url);
          break;

        case "SHOW_RECORDED":
          setMode("recorded");
          setVideoUrl(msg.url);
          break;

        case "PLAY_SECTION":
          setMode("default");
          if (videoRef.current) {
            // Repositionnement
            videoRef.current.currentTime = msg.start;
            // Appliquer la vitesse
            videoRef.current.playbackRate = speed;
            // Lancer la lecture
            videoRef.current.play();
            // Arrêter après la durée du segment adaptée à la vitesse
            const segmentMs = (msg.end - msg.start) * 1000 / speed;
            setTimeout(() => {
              if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.currentTime = msg.start;
              }
            }, segmentMs);
          }
          break;

        case "TOGGLE_EDIT":
          setEditable(msg.editable);
          break;
      }
    }

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [speed]);

  // 4) Chaque fois que la vidéo change ou que speed change, on réapplique la vitesse
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed, videoUrl, mode]);

  if (!calConfig) {
    return (
      <div style={{
        width: "100vw", height: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        Chargement de la calibration…
      </div>
    );
  }

  const wrapperStyle: CSSProperties = {
    width: "100vw",
    margin: 0,
    padding: 0,
    overflow: "visible"
  };

  return (
    <div style={wrapperStyle}>
      {mode === "default" ? (
        <PerspectiveTransform storageKey={storageKey} editable={editable}>
          <video
            ref={videoRef}
            src={videoUrl || defaultVideoUrl}
            playsInline
            style={{ width: "100%", height: "100%" }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                videoRef.current.playbackRate = speed;
                videoRef.current.pause();
              }
            }}
          />
        </PerspectiveTransform>
      ) : sharedPoints ? (
        <PerspectiveTransform points={sharedPoints} editable={editable}>
          <ContentMedia
            path={videoUrl!}
            type="video"
            playsInline
            autoPlay
            loop={mode === "performance"}
            onLoadedMetadata={(e: SyntheticEvent<HTMLVideoElement>) => {
              const vid = e.currentTarget;
              vid.playbackRate = speed;
            }}
            onEnded={() => {
              setMode("default");
              setVideoUrl(defaultVideoUrl);
              setTimeout(() => {
                if (videoRef.current) {
                  videoRef.current.pause();
                  videoRef.current.currentTime = 0;
                }
              }, 0);
            }}
            style={{ width: "100%", height: "auto" }}
          />
        </PerspectiveTransform>
      ) : (
        <div style={{
          width: "100vw", height: "100vh",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          Chargement des paramètres de perspective…
        </div>
      )}
    </div>
  );
}
