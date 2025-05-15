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

type MidiEvt = { data: number[]; timestamp: number };

/* ───────── messages inter-fenêtres ───────── */
type MessageData =
  | { type: "SHOW_DEFAULT";     url: string }
  | { type: "SHOW_PERFORMANCE"; url: string; midiEvents?: MidiEvt[] }
  | { type: "SHOW_RECORDED";    url: string; midiUrl?: string }
  | { type: "PLAY_SECTION";     start: number; end: number }
  | { type: "PLAY_SECTION"; sections: { start: number; end: number }[] }
  | { type: "TOGGLE_EDIT";      editable: boolean }
  | { type: "SET_SPEED";        speed: number }
  | { type: "SET_DELAY";        delay: number }    // 👈 NOUVEAU
  | { type: "TOGGLE_PIANO_ROLLS"; visible: boolean }   // 👈 NEW
  | { type: "TOGGLE_HANDS";      visible: boolean }    // 👈 NEW
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "SEEK_ABS";         time: number }
  | { type: "SEEK_REL";         delta: number };


/* ======================================================= */
export default function SecondScreen() {

  const [isSectionPlayback, setIsSectionPlayback] = useState(false);
  const LOOKAHEAD = 5;
  /* état lecture/pause (pour figer les notes) */
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoDelay, setVideoDelay] = useState(0); // 👈 Délai pour la vidéo (ms)

  /* contextes */
  const params          = useSearchParams();
  const soundId         = params.get("soundId") || "";
  const { sounds, updateSound } = useSoundContext();
  const { currentLearnerName }   = useLearnerContext();

  /* vidéo */
  const [mode,setMode]         = useState<"default"|"performance"|"recorded">("default");
  const [speed,setSpeed]       = useState(1);
  const [editable,setEditable] = useState(false);
  // mémorise si Alt+M vient d'être pressé
  const [altM, setAltM] = useState(false);

  const defaultVideoUrl        = sounds.find(s=>s.id===soundId)?.videoUrl;
  const [videoUrl,setVideoUrl] = useState<string|undefined>(defaultVideoUrl);
  const videoRef               = useRef<HTMLVideoElement>(null);
  /* ─── MIDI dynamiques (recorded / performance) ─── */
  const [extMidiEvents, setExtMidiEvents] = useState<NoteEvent[]|null>(null);   // events déjà “digérés”
  /* visibilité contrôlée depuis Training */
  const [showNotes , setShowNotes ] = useState(true);   // Piano Rolls
  const [showVideo , setShowVideo ] = useState(true);   // Hands


  /* ───── gel / dégel automatique ───── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay = () => { v.playbackRate = speed; setIsPlaying(true); };
    const onStop = () => { v.playbackRate = 0;     setIsPlaying(false); };

    v.addEventListener("play",  onPlay);
    v.addEventListener("pause", onStop);
    v.addEventListener("ended", onStop);

    return () => {
      v.removeEventListener("play",  onPlay);
      v.removeEventListener("pause", onStop);
      v.removeEventListener("ended", onStop);
    };
  }, [speed]);

  /* notes à afficher */
  const [sectionEvents, setSectionEvents]   = useState<NoteEvent[]>([]);
  const [sectionStartTs, setSectionStartTs] = useState<number>(0);
  const [pendingSection, setPendingSection] = useState<{start:number;end:number}|null>(null);

  /* ─────────── calibration & MIDI (inchangé) ─────────── */
  const defaultStorageKey  = `calibration-${soundId}`;
  const recordedStorageKey = "calibration-recorded";
  const [recCal,setRecCal] = useState<CalibrationConfig|null>(null);
  useEffect(() => {
    (async () => {
      const cfg = await getCalibrationConfig(recordedStorageKey);
      if (cfg) setRecCal(cfg);
    })().catch(console.error);
  }, []);


  /* points recorded/perf */
  const [recordedPtsAbs,setRecordedPtsAbs] = useState<Points|null>(null);
  useEffect(() => {
    if (!currentLearnerName || !soundId) return;
    getPositionConfig(currentLearnerName, soundId)
      .then(cfg => cfg?.perspectivePoints && setRecordedPtsAbs(cfg.perspectivePoints))
      .catch(console.error);
  }, [currentLearnerName, soundId]);


  /* points overlay notes */
  const [notePtsAbs,setNotePtsAbs] = useState<Points|null>(null);
  useEffect(() => {
    if (!currentLearnerName || !soundId) return;
    getPositionConfig(currentLearnerName, soundId + "-notes")
      .then(cfg => cfg?.perspectivePoints && setNotePtsAbs(cfg.perspectivePoints))
      .catch(console.error);
  }, [currentLearnerName, soundId]);


  /* ───────── conversion normalisée → absolue (base 640) ───────── */
  let absCrop:    { x:number; y:number; width:number; height:number } | null = null;
  // Setter “muet” pour pouvoir forcer absCrop depuis Alt + P
  const [, setAbsCrop] = useState<{ x:number; y:number; width:number; height:number } | null>(null);

  let absOffset:  { x:number; y:number } | null = null;
  let absDefaultPts: Points | null = null;

  /* 1)  Si on dispose déjà d’une calibration précise ------------------------- */
  if (recCal) {
    const W = 640;
    const k = W / recCal.baseWidth;
    const H = recCal.baseHeight * k;

    absCrop = {
      x:      recCal.normalizedCrop.x      * W,
      y:      recCal.normalizedCrop.y      * H,
      width:  recCal.normalizedCrop.width  * W,
      height: recCal.normalizedCrop.height * H,
    };
    absOffset = {
      x: recCal.normalizedVideoOffset.x * W,
      y: recCal.normalizedVideoOffset.y * H,
    };
    absDefaultPts = {
      topLeft:     { x: recCal.normalizedPoints.topLeft.x      * W, y: recCal.normalizedPoints.topLeft.y      * H },
      topRight:    { x: recCal.normalizedPoints.topRight.x     * W, y: recCal.normalizedPoints.topRight.y     * H },
      bottomRight: { x: recCal.normalizedPoints.bottomRight.x  * W, y: recCal.normalizedPoints.bottomRight.y  * H },
      bottomLeft:  { x: recCal.normalizedPoints.bottomLeft.x   * W, y: recCal.normalizedPoints.bottomLeft.y   * H },
    };
  }

  /* 2)  Fallback : aucune calibration disponible ----------------------------- */
  /*     → on crée un rectangle 640 × 360 centré dans la fenêtre pour que
          MidiFallingNotes soit toujours visible                                */
  if (!absCrop && typeof window !== "undefined") {
    const W = 640;
    const H = 360;

    absCrop = {
      x: (window.innerWidth  - W) / 2,
      y: (window.innerHeight - H) / 2,
      width:  W,
      height: H,
    };
    absOffset = { x: 0, y: 0 };          // pas de décalage vidéo
    absDefaultPts = {
      topLeft:     { x: 0, y: 0 },
      topRight:    { x: W, y: 0 },
      bottomRight: { x: W, y: H },
      bottomLeft:  { x: 0, y: H },
    };
  }


  /* chargement du MIDI */
  const [midi,setMidi] = useState<Midi|null>(null);
  useEffect(()=>{
    const snd=sounds.find(s=>s.id===soundId);
    if(!snd?.midiUrl) return;
    (async()=>{
      try{
        const buf  = await fetch(getProxiedUrl(snd.midiUrl!)).then(r=>r.arrayBuffer());
        const file = new Midi(buf);
        setMidi(file);
        if(pendingSection){
          playAndShowSection(pendingSection.start,pendingSection.end,file);
          setPendingSection(null);
        }
      }catch(err){ console.error("Erreur MIDI:",err); }
    })();
  },[soundId,sounds]);

  /* save helpers */
  const saveRecPts = (pts: Points) => {
    setRecordedPtsAbs(pts);
    if (currentLearnerName)
      savePositionConfig(currentLearnerName, soundId, {
        position: { x: 0, y: 0 },
        perspectivePoints: pts,
      }).catch(console.error);
  };

  const saveNotePts = (pts: Points) => {
    setNotePtsAbs(pts);
    if (currentLearnerName)
      savePositionConfig(currentLearnerName, soundId + "-notes", {
        position: { x: 0, y: 0 },
        perspectivePoints: pts,
      }).catch(console.error);
  };


  /** Convertit un tableau brut [{data,timestamp}] en NoteEvent[] */
  function jsonEventsToNotes(events: MidiEvt[]): NoteEvent[] {
    const onMap = new Map<number,{ts:number}>();
    const notes: NoteEvent[]=[];

    events.forEach(ev=>{
      const [status,note,vel] = ev.data;
      const cmd = status & 0xF0;
      if(cmd===0x90 && vel>0){                // note-on
        onMap.set(note,{ts:ev.timestamp});
      }else if((cmd===0x80)||(cmd===0x90&&vel===0)){ // note-off
        const start = onMap.get(note);
        if(start){
          notes.push({
            midi: note,
            time: start.ts/1000,              // → s
            duration: (ev.timestamp-start.ts)/1000
          });
          onMap.delete(note);
        }
      }
    });

    notes.sort((a,b)=>a.time-b.time);
    return notes;
  }


  /* ───────── fonction play section (modifiée) ───────── */
  function playAndShowSection(start:number,end:number,midiFile=midi){
    if(!midiFile){ setPendingSection({start,end}); return; }
    if(videoRef.current){
      videoRef.current.currentTime = start;
      videoRef.current.playbackRate = speed;
      // Lecture avec délai
      playWithDelay(videoRef.current);
      const dur=((end-start)*1000)/speed;
      setTimeout(()=>{
        videoRef.current?.pause();
        if(videoRef.current) videoRef.current.currentTime=start;
      },dur);
    }
    const evts:NoteEvent[]=[];
    midiFile.tracks.forEach(tr=>tr.notes.forEach(n=>{
      if(n.time>=start && n.time<end){
        evts.push({midi:n.midi,time:n.time-start,duration:n.duration});
      }
    }));
    evts.sort((a,b)=>a.time-b.time);
    setSectionEvents(evts);
    setSectionStartTs(performance.now());
  }

  /* ─── création des notes à afficher ───────────────────────────── */
  /* 1) cas extMidiEvents : on affiche tel quel, synchronisé sur t=0 */
  useEffect(()=>{
    if(!extMidiEvents) return;          // pas de données externes
    setSectionEvents(extMidiEvents);
    setSectionStartTs(performance.now());
  },[extMidiEvents]);

  /* 2) mode DEFAULT : look-ahead classique sur le .mid de la partition */
  useEffect(() => {
    if (
      mode !== "default"     || 
      !midi                  ||
      !videoRef.current      ||
      isSectionPlayback      // ← tant que true, on n’update pas
    ) {
      return;
    }

    const id = setInterval(() => {
      const t0   = videoRef.current!.currentTime;
      const tMax = t0 + LOOKAHEAD;
      const evts: NoteEvent[] = [];
      midi.tracks.forEach(tr =>
        tr.notes.forEach(n => {
          if (n.time >= t0 && n.time <= tMax) {
            evts.push({ midi: n.midi, time: n.time - t0, duration: n.duration });
          }
        })
      );
      evts.sort((a,b)=>a.time-b.time);
      setSectionEvents(evts);
      setSectionStartTs(performance.now());
    }, 150);

    return () => clearInterval(id);
  }, [mode, midi, speed, isSectionPlayback]);

  /* shouldLoop pour recorded */
  const shouldLoop = mode==="recorded" && !!videoUrl?.toLowerCase().endsWith("_loop.webm");

  /* Fonction utilitaire pour jouer la vidéo avec délai */
  const playWithDelay = (videoElement: HTMLVideoElement) => {
    // Si le délai est positif, on retarde la vidéo
    if (videoDelay > 0) {
      setTimeout(() => {
        videoElement.play().catch(err => console.error("Erreur lors du play vidéo:", err));
      }, videoDelay);
    } else {
      // Pas de délai, lecture immédiate
      videoElement.play().catch(err => console.error("Erreur lors du play vidéo:", err));
    }
  };

  /* ───────── messages inter-fenêtres (mis à jour) ───────── */
  useEffect(()=>{
    const handler=(e:MessageEvent)=>{
      const msg=e.data as MessageData;
      switch(msg.type){
        case "SET_DELAY":
          setVideoDelay(msg.delay);
          break;
        case "TOGGLE_PIANO_ROLLS":
          setShowNotes(msg.visible);
          break;
        case "TOGGLE_HANDS":
          setShowVideo(msg.visible);
          break;
        case "SET_SPEED":   setSpeed(msg.speed); break;
        case "TOGGLE_EDIT": setEditable(msg.editable); break;
        case "SHOW_DEFAULT":
          setMode("default"); setVideoUrl(msg.url);
          videoRef.current?.pause();
          if(videoRef.current) videoRef.current.currentTime=0;
          break;
        case "SHOW_PERFORMANCE":
          setMode("performance"); setVideoUrl(msg.url); setExtMidiEvents(msg.midiEvents ? jsonEventsToNotes(msg.midiEvents) : null); break;
        case "SHOW_RECORDED":
          setMode("recorded");
          setVideoUrl(msg.url);

          if (msg.midiUrl) {
            // charge les events MIDI d’abord
            fetch(getProxiedUrl(msg.midiUrl))
              .then(r => r.json())
              .then((evts: MidiEvt[]) => {
                const notes = jsonEventsToNotes(evts);
                setExtMidiEvents(notes);

                // **une fois le MIDI prêt**, on remet la vidéo à 0 et on la lance **
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  playWithDelay(videoRef.current);
                }
              })
              .catch(console.error);
          } else {
            setExtMidiEvents(null);
          }
          break;

        case "PLAY_SECTION": {
          setMode("default");
          setIsSectionPlayback(true);
          
          // 2️⃣ Récupère la liste des intervalles
          const intervals = "sections" in msg
            ? msg.sections
            : [{ start: msg.start, end: msg.end }];
          
          // 3️⃣ Joue la vidéo de la première à la dernière seconde
          const first = intervals[0].start;
          const last  = intervals[intervals.length - 1].end;
          if (videoRef.current) {
            videoRef.current.currentTime = first;
            videoRef.current.playbackRate = speed;
            playWithDelay(videoRef.current);
            setTimeout(() => {
              videoRef.current?.pause();
              if (videoRef.current) videoRef.current.currentTime = first;
              setIsSectionPlayback(false);
            }, ((last - first) * 1000) / speed);
          }

          // 4️⃣ Construit la liste fusionnée des NoteEvent
          const merged: NoteEvent[] = [];
          midi?.tracks.forEach(track =>
            track.notes.forEach(n =>
              intervals.forEach(({ start, end }) => {
                if (n.time >= start && n.time < end) {
                  merged.push({
                    midi: n.midi,
                    time: n.time - first,
                    duration: n.duration
                  });
                }
              })
            )
          );
          merged.sort((a, b) => a.time - b.time);

          // 5️⃣ Affiche-les toutes d’un coup
          setSectionEvents(merged);
          setSectionStartTs(performance.now());
          break;
        }
        case "PLAY":
          if (videoRef.current) playWithDelay(videoRef.current);
          break;
        case "PAUSE":
          videoRef.current?.pause();
          break;
        case "SEEK_ABS":
          if (videoRef.current) {
            // msg.time est en secondes, videoDelay en ms, on convertit en s
            const target = Math.max(0, msg.time - videoDelay / 1000);
            videoRef.current.currentTime = target;
          }
          break;
        case "SEEK_REL":
          if (videoRef.current) {
            // on ajuste aussi la position relative
            const target =
              videoRef.current.currentTime +
              msg.delta -
              videoDelay / 1000;
            videoRef.current.currentTime = Math.max(0, target);
          }
          break;
      }
    };
    window.addEventListener("message",handler);
    return()=>window.removeEventListener("message",handler);
  },[speed,midi,videoDelay]); // Ajout de videoDelay dans les dépendances

  /* ───────── ALT + P : reset / recentre les notes ───────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {      
      // Alt + P (insensible à la casse)
      if (e.altKey && e.key.toLowerCase() === "p") {
        console.log("[Alt-P] détecté ✅");               // ← NEW
        console.log("absCrop      :", absCrop);          // ← NEW
        console.log("absDefaultPts:", absDefaultPts);
        // 1) Si la calibration de base existe, on la remet
        if (absDefaultPts) {
          saveNotePts(absDefaultPts);
          return;
        }

                // 2) Sinon, on force un rectangle centré à l’écran
        const W = 640;            // largeur par défaut du piano-roll
        const H = 360;            // hauteur 16/9 pour que ça tienne partout

        const offsetX = (window.innerWidth  - W) / 2;
        const offsetY = (window.innerHeight - H) / 2;

        const centred = {
          topLeft     : { x: offsetX    , y: offsetY     },
          topRight    : { x: offsetX + W, y: offsetY     },
          bottomRight : { x: offsetX + W, y: offsetY + H },
          bottomLeft  : { x: offsetX    , y: offsetY + H },
        } as const;

        // on met aussi à jour absCrop pour que le composant sache sa taille
        setAbsCrop({ x: offsetX, y: offsetY, width: W, height: H });

        saveNotePts(centred);

      }
      
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [absCrop, absDefaultPts]);      // ← dépendances minimales


  /* remet la vitesse seulement pendant la lecture */
  useEffect(()=>{
    if(isPlaying && videoRef.current){
      videoRef.current.playbackRate = speed;
    }
  },[speed, isPlaying, videoUrl, mode]);

  /* ─── envoyer DURATION après loadedmetadata ─── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      window.opener?.postMessage({ type: "DURATION", duration: v.duration }, "*");
    };
    v.addEventListener("loadedmetadata", onLoaded);
    return () => v.removeEventListener("loadedmetadata", onLoaded);
  }, [videoUrl]);

  /* ─── envoyer TIME_UPDATE en continu ─── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const id = setInterval(() => {
      window.opener?.postMessage({ type: "TIME_UPDATE", time: v.currentTime }, "*");
    }, 200);
    return () => clearInterval(id);
  }, [videoUrl]);

  /* ───────── rendu recorded/perf (inchangé) ───────── */
  const renderRecordedLikeTraining = (
    src:string, autoPlay:boolean, loop:boolean, onEnd:()=>void
  ) => {
    if(!absCrop || !absOffset) return null;
    const pts=recordedPtsAbs||absDefaultPts;
    if(!pts) return null;

    const inner = src.startsWith("blob:")||src.startsWith("data:")
      ? <video src={src} autoPlay={autoPlay} loop={loop} playsInline
               onLoadedMetadata={e=>(e.currentTarget.playbackRate=speed)}
               onEnded={onEnd}
               style={{position:"absolute",left:-absOffset.x,top:-absOffset.y,width:640,height:"auto", opacity: showVideo ? 1 : 0, pointerEvents: showVideo ? "auto" : "none"}}/>
      : <ContentMedia path={src} type="video" autoPlay={autoPlay} loop={loop} playsInline
                      onLoadedMetadata={(e:SyntheticEvent<HTMLVideoElement>)=>(e.currentTarget.playbackRate=speed)}
                      onEnded={onEnd}
                      style={{position:"absolute",left:-absOffset.x,top:-absOffset.y,width:640,height:"auto", opacity: showVideo ? 1 : 0, pointerEvents: showVideo ? "auto" : "none"}}/>;

    return (
      <div style={{width:absCrop.width,height:absCrop.height,position:"relative",overflow:"visible"}}>
        <div style={{position:"absolute",left:absCrop.x,top:absCrop.y,width:absCrop.width,height:absCrop.height,overflow:"visible"}}>
          <PerspectiveTransform points={pts} editable={editable} enableGroupDrag onPointsChange={saveRecPts}>
            {inner}
          </PerspectiveTransform>
        </div>
      </div>
    );
  };

  /* ───────── overlay notes ───────── */
  const renderNotes = () => {
    if(!showNotes || !absCrop || !absOffset || sectionEvents.length===0) return null;
    const pts=notePtsAbs||absDefaultPts;
    if(!pts) return null;
    return (
      <div style={{width:absCrop.width,height:absCrop.height,position:"absolute",
                   left:absCrop.x,top:absCrop.y,zIndex:10,
                   pointerEvents:editable?"auto":"none"}}>
        <PerspectiveTransform points={pts} editable={editable} enableGroupDrag onPointsChange={saveNotePts}>
          <MidiFallingNotes
            events={sectionEvents}
            sectionStart={sectionStartTs}
            speed={isPlaying ? speed : 0}
            width={absCrop.width}
            height={absCrop.height}
          />
        </PerspectiveTransform>
      </div>
    );
  };

  /* loader si calibration indispensable manquante */
  if((mode==="performance"||mode==="recorded") && (!absCrop||!absOffset)){
    return(
      <div style={{width:"100vw",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        Chargement des paramètres de perspective…
      </div>
    );
  }

  /* wrapper global */
  const wrap:CSSProperties={width:"100vw",margin:0,padding:0,overflow:"visible"};

  /* ───────────────────────── RENDU ───────────────────────── */
  return(
    <div style={wrap}>

      {/* partition (default) */}
      {mode==="default" && (
        <PerspectiveTransform storageKey={defaultStorageKey} editable={editable} enableGroupDrag>
          <video ref={videoRef}
                 src={videoUrl||defaultVideoUrl}
                 playsInline
                 style={{width:"100%",height:"auto", opacity: showVideo ? 1 : 0, pointerEvents: showVideo ? "auto" : "none"}}
                 onLoadedMetadata={()=>{
                   if(videoRef.current){
                     videoRef.current.currentTime  = 0;
                     videoRef.current.playbackRate = 0;  // figé au chargement
                     videoRef.current.pause();
                   }
                 }}
          />
        </PerspectiveTransform>
      )}

      {/* recorded / performance */}
      {mode!=="default" &&
        renderRecordedLikeTraining(
          videoUrl||"",
          true,
          shouldLoop,
          ()=>{
            setMode("default");
            setVideoUrl(defaultVideoUrl);
            setExtMidiEvents(null);
            videoRef.current?.pause();
            if(videoRef.current) videoRef.current.currentTime = 0;
          }
        )
      }

      {/* overlay notes */}
      {renderNotes()}
    </div>
  );
}
