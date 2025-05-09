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
import MidiFallingNotes, { NoteEvent } from "../../../../components/MidiFallingNotes";
import { Midi } from "@tonejs/midi";
import {
  getCalibrationConfig,
  CalibrationConfig,
  savePositionConfig,
  getPositionConfig,
} from "../../../services/calibrationService";
import { getProxiedUrl } from "../../../utils/proxyUrl";

/* ---------- messages inter-fenêtres ---------- */
type MessageData =
  | { type: "SHOW_DEFAULT"; url: string }
  | { type: "SHOW_PERFORMANCE"; url: string }
  | { type: "SHOW_RECORDED"; url: string }
  | { type: "PLAY_SECTION"; start: number; end: number }
  | { type: "TOGGLE_EDIT"; editable: boolean }
  | { type: "SET_SPEED"; speed: number };

/* ====================================================================== */
export default function SecondScreen() {
  /* contextes ---------------------------------------------------------- */
  const params                     = useSearchParams();
  const soundId                    = params.get("soundId") || "";
  const { sounds, updateSound }    = useSoundContext();
  const { currentLearnerName }     = useLearnerContext();

  /* vidéo -------------------------------------------------------------- */
  const [mode, setMode]            = useState<"default"|"performance"|"recorded">("default");
  const [speed, setSpeed]          = useState(1);
  const [editable, setEditable]    = useState(false);
  const defaultVideoUrl            = sounds.find(s => s.id === soundId)?.videoUrl;
  const [videoUrl, setVideoUrl]    = useState<string | undefined>(defaultVideoUrl);
  const videoRef                   = useRef<HTMLVideoElement>(null);

  /* falling-notes ------------------------------------------------------ */
  const [sectionEvents, setSectionEvents]   = useState<NoteEvent[]>([]);
  const [sectionStartTs, setSectionStartTs] = useState(0);
  const [pendingSection, setPendingSection] =
        useState<{ start: number; end: number } | null>(null);

  /* calibrations ------------------------------------------------------- */
  const defaultStorageKey  = `calibration-${soundId}`;
  const recordedStorageKey = "calibration-recorded";
  const [recCal, setRecCal] = useState<CalibrationConfig|null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getCalibrationConfig(recordedStorageKey);
        if (cfg) setRecCal(cfg);
        else {
          const raw = localStorage.getItem(recordedStorageKey);
          if (raw) setRecCal(JSON.parse(raw));
        }
      } catch {
        const raw = localStorage.getItem(recordedStorageKey);
        if (raw) setRecCal(JSON.parse(raw));
      }
    })();
  }, []);

  /* points pour vidéos recorded/perf ----------------------------------- */
  const [recordedPtsAbs, setRecordedPtsAbs] = useState<Points|null>(null);
  useEffect(() => {
    if (!currentLearnerName || !soundId) return;
    getPositionConfig(currentLearnerName, soundId)
      .then(cfg => {
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

  /* points pour l’overlay notes --------------------------------------- */
  const [notePtsAbs, setNotePtsAbs] = useState<Points|null>(null);
  useEffect(() => {
    if (!currentLearnerName || !soundId) return;
    getPositionConfig(currentLearnerName, soundId + "-notes")
      .then(cfg => {
        if (cfg?.perspectivePoints) setNotePtsAbs(cfg.perspectivePoints);
        else {
          const raw = localStorage.getItem("notesPerspectivePoints");
          if (raw) setNotePtsAbs(JSON.parse(raw));
        }
      })
      .catch(() => {
        const raw = localStorage.getItem("notesPerspectivePoints");
        if (raw) setNotePtsAbs(JSON.parse(raw));
      });
  }, [currentLearnerName, soundId]);

  /* conversion normalisée → absolue (base 640) ------------------------ */
  let absCrop   : {x:number;y:number;width:number;height:number}|null = null;
  let absOffset : {x:number;y:number}|null = null;
  let absDefaultPts: Points|null = null;
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
    absOffset = {
      x: recCal.normalizedVideoOffset.x * W,
      y: recCal.normalizedVideoOffset.y * H,
    };
    absDefaultPts = {
      topLeft:     { x: recCal.normalizedPoints.topLeft.x     * W, y: recCal.normalizedPoints.topLeft.y     * H },
      topRight:    { x: recCal.normalizedPoints.topRight.x    * W, y: recCal.normalizedPoints.topRight.y    * H },
      bottomRight: { x: recCal.normalizedPoints.bottomRight.x * W, y: recCal.normalizedPoints.bottomRight.y * H },
      bottomLeft:  { x: recCal.normalizedPoints.bottomLeft.x  * W, y: recCal.normalizedPoints.bottomLeft.y  * H },
    };
  }

  /* chargement du MIDI ------------------------------------------------- */
  const [midi, setMidi] = useState<Midi|null>(null);
  useEffect(() => {
    const snd = sounds.find(s => s.id === soundId);
    if (!snd?.midiUrl) return;
    (async () => {
      try {
        const buf  = await fetch(getProxiedUrl(snd.midiUrl!)).then(r => r.arrayBuffer());
        const file = new Midi(buf);
        setMidi(file);

        if (pendingSection) {
          playAndShowSection(pendingSection.start, pendingSection.end, file);
          setPendingSection(null);
        }
      } catch (err) {
        console.error("Erreur chargement MIDI:", err);
      }
    })();
  }, [soundId, sounds]);

  /* helpers de sauvegarde --------------------------------------------- */
  const saveRecPts = (pts: Points) => {
    setRecordedPtsAbs(pts);
    if (currentLearnerName)
      savePositionConfig(currentLearnerName, soundId, {
        position: {x:0,y:0},
        perspectivePoints: pts,
      }).catch(console.error);
    localStorage.setItem("recordedVideoPerspectivePoints", JSON.stringify(pts));
  };

  const saveNotePts = (pts: Points) => {
    setNotePtsAbs(pts);
    if (currentLearnerName)
      savePositionConfig(currentLearnerName, soundId + "-notes", {
        position: {x:0,y:0},
        perspectivePoints: pts,
      }).catch(console.error);
    localStorage.setItem("notesPerspectivePoints", JSON.stringify(pts));
  };

  /* fonction principale : joue section + notes ------------------------ */
  function playAndShowSection(start: number, end: number, midiFile = midi) {
    if (!midiFile) { setPendingSection({start,end}); return; }

    /* vidéo */
    if (videoRef.current) {
      videoRef.current.currentTime  = start;
      videoRef.current.playbackRate = speed;
      videoRef.current.play();
      const dur = ((end - start)*1000)/speed;
      setTimeout(() => {
        videoRef.current?.pause();
        if (videoRef.current) videoRef.current.currentTime = start;
      }, dur);
    }

    /* notes */
    const evts: NoteEvent[] = [];
    midiFile.tracks.forEach(tr =>
      tr.notes.forEach(n => {
        if (n.time >= start && n.time < end) {
          evts.push({ midi:n.midi, time:n.time - start, duration:n.duration });
        }
      })
    );
    evts.sort((a,b)=>a.time - b.time);
    setSectionEvents(evts);
    setSectionStartTs(performance.now());
  }

  /* shouldLoop -------------------------------------------------------- */
  const shouldLoop =
    mode === "recorded" && !!videoUrl?.toLowerCase().endsWith("_loop.webm");

  /* messages inter-fenêtres ------------------------------------------ */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as MessageData;
      switch (msg.type) {
        case "SET_SPEED":
          setSpeed(msg.speed);
          break;
        case "TOGGLE_EDIT":
          setEditable(msg.editable);
          break;

        case "SHOW_DEFAULT":
          setMode("default");
          setVideoUrl(msg.url);
          videoRef.current?.pause();
          if (videoRef.current) videoRef.current.currentTime = 0;
          setSectionEvents([]);
          break;

        case "SHOW_PERFORMANCE":
          setMode("performance");
          setVideoUrl(msg.url);
          setSectionEvents([]);
          break;

        case "SHOW_RECORDED":
          setMode("recorded");
          setVideoUrl(msg.url);
          setSectionEvents([]);
          break;

        case "PLAY_SECTION":
          setMode("default");
          playAndShowSection(msg.start, msg.end);
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [speed, midi]);

  /* réapplique la vitesse ------------------------------------------- */
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, videoUrl, mode]);

  /* rendu recorded/performance --------------------------------------- */
  const renderRecordedLikeTraining = (
    src: string,
    autoPlay: boolean,
    loop: boolean,
    onEnd: () => void
  ) => {
    if (!absCrop || !absOffset) return null;
    const pts = recordedPtsAbs || absDefaultPts;
    if (!pts) return null;

    const inner = src.startsWith("blob:") || src.startsWith("data:")
      ? (
        <video
          src={src}
          autoPlay={autoPlay}
          loop={loop}
          playsInline
          onLoadedMetadata={e => (e.currentTarget.playbackRate = speed)}
          onEnded={onEnd}
          style={{ position:"absolute", left:-absOffset.x, top:-absOffset.y, width:640, height:"auto" }}
        />
      )
      : (
        <ContentMedia
          path={src}
          type="video"
          autoPlay={autoPlay}
          loop={loop}
          playsInline
          onLoadedMetadata={(e:SyntheticEvent<HTMLVideoElement>) => (e.currentTarget.playbackRate = speed)}
          onEnded={onEnd}
          style={{ position:"absolute", left:-absOffset.x, top:-absOffset.y, width:640, height:"auto" }}
        />
      );

    return (
      <div style={{ width:absCrop.width, height:absCrop.height, position:"relative", overflow:"visible" }}>
        <div style={{ position:"absolute", left:absCrop.x, top:absCrop.y, width:absCrop.width, height:absCrop.height, overflow:"visible" }}>
          <PerspectiveTransform points={pts} editable={editable} enableGroupDrag onPointsChange={saveRecPts}>
            {inner}
          </PerspectiveTransform>
        </div>
      </div>
    );
  };

  /* overlay notes ----------------------------------------------------- */
  const renderNotes = () => {
    if (!absCrop || !absOffset) return null;
    if (sectionEvents.length === 0) return null;
    const pts = notePtsAbs || absDefaultPts;
    if (!pts) return null;

    return (
      <div style={{ width:absCrop.width, height:absCrop.height, position:"absolute",
                    left:absCrop.x, top:absCrop.y, zIndex:10,
                    pointerEvents: editable ? "auto" : "none" }}>
        <PerspectiveTransform points={pts} editable={editable} enableGroupDrag onPointsChange={saveNotePts}>
          <MidiFallingNotes events={sectionEvents} sectionStart={sectionStartTs} speed={speed} width={absCrop.width} height={absCrop.height} />
        </PerspectiveTransform>
      </div>
    );
  };

  /* loader si calib manquante ---------------------------------------- */
  if ((mode==="performance" || mode==="recorded") && (!absCrop || !absOffset)) {
    return (
      <div style={{ width:"100vw", height:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        Chargement des paramètres de perspective…
      </div>
    );
  }

  /* wrapper ----------------------------------------------------------- */
  const wrap: CSSProperties = { width:"100vw", margin:0, padding:0, overflow:"visible" };

  /* =========================== RENDU ================================ */
  return (
    <div style={wrap}>
      {/* partition */}
      {mode==="default" && (
        <PerspectiveTransform
          storageKey={defaultStorageKey}
          editable={editable}
          enableGroupDrag
          onPointsChange={pts => {
            const s = sounds.find(s => s.id === soundId);
            if (s)
              updateSound({ ...s, calibration:{ ...s.calibration, points: pts } }).catch(console.error);
          }}
        >
          <video
            ref={videoRef}
            src={videoUrl || defaultVideoUrl}
            playsInline
            style={{ width:"100%", height:"auto" }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                videoRef.current.playbackRate = speed;
                videoRef.current.pause();
              }
            }}
          />
        </PerspectiveTransform>
      )}

      {/* recorded / performance */}
      {mode !== "default" &&
        renderRecordedLikeTraining(videoUrl || "", true, shouldLoop, () => {
          setMode("default");
          setVideoUrl(defaultVideoUrl);
          videoRef.current?.pause();
          if (videoRef.current) videoRef.current.currentTime = 0;
        })
      }

      {/* overlay notes */}
      {renderNotes()}
    </div>
  );
}
