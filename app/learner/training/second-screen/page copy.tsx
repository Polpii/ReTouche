/* app/learner/training/second-screen/page.tsx */
"use client";

import React, {
  useEffect,
  useState,
  useRef,
  CSSProperties,
  SyntheticEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { useSoundContext } from "../../../context/SoundContext";
import { useLearnerContext } from "../../../context/LearnerContext";
import PerspectiveTransform, { Points } from "../../../../components/PerspectiveTransform";
import ContentMedia from "../../../../components/ContentMedia";
import {
  getCalibrationConfig,
  CalibrationConfig,
  savePositionConfig,
  getPositionConfig,
} from "../../../services/calibrationService";

/* ------------------------------------------------------------------------- */
/*                 Définition des messages inter-fenêtres                    */
type MessageData =
  | { type: "SHOW_DEFAULT"; url: string }
  | { type: "SHOW_PERFORMANCE"; url: string }
  | { type: "SHOW_RECORDED"; url: string }
  | { type: "PLAY_SECTION"; start: number; end: number }
  | { type: "TOGGLE_EDIT"; editable: boolean }
  | { type: "SET_SPEED"; speed: number };
/* ------------------------------------------------------------------------- */

export default function SecondScreen() {
  /* ---------- Contextes & paramètres ---------- */
  const params = useSearchParams();
  const soundId = params.get("soundId") || "";
  const { sounds, updateSound } = useSoundContext();
  const { currentLearnerName } = useLearnerContext();
  

  /* ---------- États ---------- */
  const [mode, setMode] = useState<"default" | "performance" | "recorded">(
    "default"
  );
  const [speed, setSpeed] = useState(1);
  const [editable, setEditable] = useState(false);
  const defaultVideoUrl = sounds.find((s) => s.id === soundId)?.videoUrl;
  const [videoUrl, setVideoUrl] = useState<string | undefined>(defaultVideoUrl);

  const videoRef = useRef<HTMLVideoElement>(null);

  /* ---------- Calibration “partition” (gérée par PerspectiveTransform) ---------- */
  const defaultStorageKey = `calibration-${soundId}`;

  /* ---------- Calibration “recorded/performance” ---------- */
  const recordedStorageKey = "calibration-recorded";
  const [recCal, setRecCal] = useState<CalibrationConfig | null>(null);

  useEffect(() => {
    getCalibrationConfig(recordedStorageKey)
      .then((cfg) => {
        if (cfg) setRecCal(cfg);
        else {
          const raw = localStorage.getItem(recordedStorageKey);
          if (raw) setRecCal(JSON.parse(raw));
        }
      })
      .catch(() => {
        const raw = localStorage.getItem(recordedStorageKey);
        if (raw) setRecCal(JSON.parse(raw));
      });
  }, []);

  /* ---------- Points “enregistrés” (Learner+Sound) ---------- */
  const [recordedPtsAbs, setRecordedPtsAbs] = useState<Points | null>(null);

  /* Charge les points stockés par savePositionConfig (même logique que training) */
  useEffect(() => {
    if (!currentLearnerName || !soundId) return;

    getPositionConfig(currentLearnerName, soundId)
      .then((cfg) => {
        if (cfg?.perspectivePoints) setRecordedPtsAbs(cfg.perspectivePoints);
        else {
          const raw = localStorage.getItem("recordedVideoPerspectivePoints");
          if (raw) setRecordedPtsAbs(JSON.parse(raw));
        }
      })
      .catch(() => {
        const raw = localStorage.getItem("recordedVideoPerspectivePoints");
        if (raw) setRecordedPtsAbs(JSON.parse(raw));
      });
  }, [currentLearnerName, soundId]);

  /* ---------- Conversion normalised → absolu (base 640) ---------- */
  let absCrop: { x: number; y: number; width: number; height: number } | null =
    null;
  let absDefaultPts: Points | null = null;
  let absOffset: { x: number; y: number } | null = null;

  if (recCal) {
    const W = 640;
    const k = W / recCal.baseWidth;
    const H = recCal.baseHeight * k;

    absCrop = {
      x: recCal.normalizedCrop.x * W,
      y: recCal.normalizedCrop.y * H,
      width: recCal.normalizedCrop.width * W,
      height: recCal.normalizedCrop.height * H,
    };

    absDefaultPts = {
      topLeft: {
        x: recCal.normalizedPoints.topLeft.x * W,
        y: recCal.normalizedPoints.topLeft.y * H,
      },
      topRight: {
        x: recCal.normalizedPoints.topRight.x * W,
        y: recCal.normalizedPoints.topRight.y * H,
      },
      bottomRight: {
        x: recCal.normalizedPoints.bottomRight.x * W,
        y: recCal.normalizedPoints.bottomRight.y * H,
      },
      bottomLeft: {
        x: recCal.normalizedPoints.bottomLeft.x * W,
        y: recCal.normalizedPoints.bottomLeft.y * H,
      },
    };

    absOffset = {
      x: recCal.normalizedVideoOffset.x * W,
      y: recCal.normalizedVideoOffset.y * H,
    };
  }

  /* =========== HANDLERS de sauvegarde =========== */

  /* partition */
  const handleDefaultPointsChange = (pts: Points) => {
    const sound = sounds.find((s) => s.id === soundId);
    if (!sound) return;
    updateSound({
      ...sound,
      calibration: { ...sound.calibration, points: pts },
    }).catch(console.error);
  };

  /* recorded/performance */
  const handleRecordedPointsChange = (pts: Points) => {
    setRecordedPtsAbs(pts);

    if (currentLearnerName)
      savePositionConfig(currentLearnerName, soundId, {
        position: { x: 0, y: 0 },
        perspectivePoints: pts,
      }).catch(console.error);

    localStorage.setItem("recordedVideoPerspectivePoints", JSON.stringify(pts));
  };

  /* =========== Messages inter-fenêtres =========== */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as MessageData;
      switch (msg.type) {
        case "SET_SPEED":
          setSpeed(msg.speed);
          break;

        case "SHOW_DEFAULT":
          setMode("default");
          setVideoUrl(msg.url);
          videoRef.current?.pause();
          videoRef.current && (videoRef.current.currentTime = 0);
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
            videoRef.current.currentTime = msg.start;
            videoRef.current.playbackRate = speed;
            videoRef.current.play();
            const dur = ((msg.end - msg.start) * 1000) / speed;
            setTimeout(() => {
              videoRef.current?.pause();
              videoRef.current && (videoRef.current.currentTime = msg.start);
            }, dur);
          }
          break;

        case "TOGGLE_EDIT":
          setEditable(msg.editable);
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [speed]);

  const shouldLoop =
  mode === "recorded" &&
  !!videoUrl?.toLowerCase().endsWith("_loop.webm");   // ← double “!” force à true/false


  /* Réapplique la vitesse */
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, videoUrl, mode]);

  /* =========== Rendu recorded/performance =========== */
  const renderRecordedLikeTraining = (
    src: string,
    autoPlay: boolean,
    loop: boolean,
    onEnded: () => void
  ) => {
    if (!absCrop || !absOffset) return null;

    /* points à utiliser : ceux sauvegardés (learner) → sinon défaut calibration */
    const pts = recordedPtsAbs || absDefaultPts;
    if (!pts) return null;

    const inner = src.startsWith("blob:") || src.startsWith("data:")
      ? (
        /* ----------- vidéo locale ----------- */
        <video
          src={src}
          autoPlay={autoPlay}
          loop={loop}
          playsInline
          onLoadedMetadata={(e) => (e.currentTarget.playbackRate = speed)}
          onEnded={onEnded}
          style={{
            position: "absolute",
            left: -absOffset.x,
            top: -absOffset.y,
            width: "640px",
            height: "auto",
          }}
        />
      )
      : (
        /* ----------- vidéo distante (Firebase ou HTTP) ----------- */
        <ContentMedia
          path={src}
          type="video"
          autoPlay={autoPlay}
          loop={loop}
          playsInline
          onLoadedMetadata={(e: SyntheticEvent<HTMLVideoElement>) => {
            e.currentTarget.playbackRate = speed;
          }}
          onEnded={onEnded}
          style={{
            position: "absolute",
            left: -absOffset.x,
            top: -absOffset.y,
            width: "640px",
            height: "auto",
          }}
        />
      );

    return (
      <div
        style={{
          width: absCrop.width,
          height: absCrop.height,
          position: "relative",
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: absCrop.x,
            top: absCrop.y,
            width: absCrop.width,
            height: absCrop.height,
            overflow: "visible",
          }}
        >
          <PerspectiveTransform
            points={pts}
            editable={editable}
            enableGroupDrag
            onPointsChange={handleRecordedPointsChange}
          >
            {inner}
          </PerspectiveTransform>
        </div>
      </div>
    );
  };

  /* -------- Loader (si calibration indispensable) -------- */
  if (
    (mode === "performance" || mode === "recorded") &&
    (!absCrop || !absOffset)
  ) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Chargement des paramètres de perspective…
      </div>
    );
  }

  /* -------- Style global -------- */
  const wrapStyle: CSSProperties = {
    width: "100vw",
    margin: 0,
    padding: 0,
    overflow: "visible",
  };
  

  /* ====================  RENDU ==================== */
  return (
    <div style={wrapStyle}>
      {/* ---------- Vidéo partition ---------- */}
      {mode === "default" && (
        <PerspectiveTransform
          storageKey={defaultStorageKey}
          editable={editable}
          enableGroupDrag
          onPointsChange={handleDefaultPointsChange}
        >
          <video
            ref={videoRef}
            src={videoUrl || defaultVideoUrl}
            playsInline
            style={{ width: "100%", height: "auto" }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                videoRef.current.playbackRate = speed;
                videoRef.current.pause();
              }
            }}
          />
        </PerspectiveTransform>
      )}

      {/* ---------- Vidéos performance / recorded ---------- */}
      {mode !== "default" &&
        renderRecordedLikeTraining(
          videoUrl || "",
          true,
          shouldLoop,
          () => {
            setMode("default");
            setVideoUrl(defaultVideoUrl);
            videoRef.current?.pause();
            videoRef.current && (videoRef.current.currentTime = 0);
          }
        )}
    </div>
  );
}
