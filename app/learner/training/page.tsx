"use client";
import React, { useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSoundContext } from "../../context/SoundContext";
import { useLearnerContext } from "../../context/LearnerContext";
import PerspectiveTransform, { Points } from "../../../components/PerspectiveTransform";
import AudioTimelineReadOnly, { Section } from "../../../components/AudioTimelineReadOnly";
import { Rnd } from "react-rnd";
import { Midi } from "@tonejs/midi";
import { getCalibrationConfig, CalibrationConfig, savePositionConfig, getPositionConfig } from "../../services/calibrationService";
import { uploadVideo, uploadMidiData, addRecordingToLearner } from "../../services/mediaService";
import ContentMedia from "../../../components/ContentMedia";
import { getProxiedUrl } from '../../utils/proxyUrl';
import { startTrainingSession, endTrainingSession, trackEvent, trackMetric, trackSectionMetric, trackSectionListeningTime, TrainingEventTypes } from "@/app/services/analyticsService";
import {
  sendVideoToSecondScreen,
  clearSecondScreen,
  closeSecondScreen,
  setupPerspectiveChangeListener,
  PerspectivePoints
} from "../../services/secondScreenService";


// Interface pour un événement MIDI
interface MidiEvent {
  data: number[];
  timestamp: number;
}


/** Petit composant Switch façon iOS */
function IOSSwitch({ checked, onChange }: { checked: boolean; onChange: () => void; }) {
  return (
    <label style={{ position: "relative", display: "inline-block", width: "50px", height: "28px", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0, cursor: "pointer" }} />
      <span style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: checked ? "#0070f3" : "#ccc", transition: ".4s", borderRadius: "34px",
      }} />
      <span style={{
        position: "absolute", height: "22px", width: "22px", left: "3px", bottom: "3px",
        backgroundColor: "white", transition: ".4s", borderRadius: "50%",
        transform: checked ? "translateX(22px)" : "translateX(0)",
      }} />
    </label>
  );
}

interface RecordedVideo {
  name: string;
  blobUrl: string;
  midiUrl?: string;
}

interface ContainerPos {
  x: number;
  y: number;
}

export default function TrainingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const soundId = searchParams?.get("soundId") ?? null;
  // 👇 Hook placé à l’intérieur du composant
  const [videoDelayMs, setVideoDelayMs] = useState(250);
  
  // Référence pour limiter la fréquence des sauvegardes de calibration
  const lastCalibrationSaveTime = useRef<number>(0);
  
  // Ajout des états manquants
  const [loading, setLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [mainVideoReady, setMainVideoReady] = useState(false);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const { currentLearnerName, learners, updateLearner } = useLearnerContext();
  const { sounds, updateSound } = useSoundContext();
  const selectedSound = sounds.find((s) => s.id === soundId);

  // Initialisation de la session d’analyse au chargement
  useEffect(() => {
    if (currentLearnerName && soundId && selectedSound) {
      // On passe également le titre du son pour l'afficher dans les analyses
      startTrainingSession(currentLearnerName, soundId, selectedSound.title || "");
      // Enregistrer l'événement de démarrage de session
      trackEvent(TrainingEventTypes.SESSION_START);

      // Enregistrer le temps d'activité lors de la fermeture de la page
      const handleBeforeUnload = () => {
        trackEvent(TrainingEventTypes.PAGE_LEAVE);
        endTrainingSession();
      };

      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        endTrainingSession();
      };
    }
  }, [currentLearnerName, soundId, selectedSound]);

  useEffect(() => {
    if (!currentLearnerName) router.push("/learner/profile");
    if (!soundId) router.push("/learner/select-sound");
  }, [currentLearnerName, soundId, router]);

  useEffect(() => {
    if (!selectedSound) router.push("/learner/select-sound");
  }, [selectedSound, router]);

  // États de contrôle
  const [editable, setEditable] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    sendToSecond({ type: "SET_SPEED", speed: playbackSpeed });
  }, [playbackSpeed]);

  const [currentTime, setCurrentTime] = useState(0);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const performanceVideoRef = useRef<HTMLVideoElement | null>(null);
  const loopVideoRef = useRef<HTMLVideoElement | null>(null); // Une référence distincte pour le looper

  // Vidéos enregistrées du profil (enregistrées via le bouton blanc)
  const [recordedVideos, setRecordedVideos] = useState<RecordedVideo[]>([]);
  const [selectedRecordedName, setSelectedRecordedName] = useState<string>("");

  // Nouvel état pour le dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Nouvel état pour gérer la sauvegarde Firebase
  const [saveToFirebase, setSaveToFirebase] = useState(false);
  
  // Fonction utilitaire pour vérifier si les sauvegardes Firebase sont autorisées
  const shouldSaveToFirebase = () => {
    return saveToFirebase || currentLearnerName !== "Polpii";
  };
  
  // Fonction utilitaire de formatage
  const formatDisplay = (recordingName: string) => {
    const baseName = recordingName.replace(".webm", "");
    const parts = baseName.split("_");
    const date = parts[0];
    const time = parts[1];
    let songName = "";
    if (parts.length >= 4) {
      // On supprime le nom du learner (parts[2]) pour ne garder que le songName
      songName = parts.slice(3).join("_");
    } else {
      songName = parts.slice(2).join("_");
    }
    return `${date} | ${time} | ${songName}`;
  };

  // États pour l’overlay et le performance recording (temporaire)
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);
  const [isPerformanceRecording, setIsPerformanceRecording] = useState(false);
  const [performanceVideoURL, setPerformanceVideoURL] = useState<string | null>(null);
  const [showPerformancePlayback, setShowPerformancePlayback] = useState(false);
  // Références pour les événements MIDI de performance
  const performanceMIDIEventsRef = useRef<MidiEvent[]>([]);
  const lastPerformanceEventRef = useRef<number>(0);
  const performanceStreamRef = useRef<MediaStream | null>(null);
  const performanceStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const performanceRecordStartRef = useRef<number>(0);
  const performanceRecorderRef = useRef<MediaRecorder | null>(null);

  // Références pour la lecture des vidéos enregistrées (dropdown et performance playback)
  const recordedVideoRef = useRef<HTMLVideoElement | null>(null);
  
  // Ajout d’un état pour suivre l’état de la pédale gauche (soft pedal)
  const [leftPedalPressed, setLeftPedalPressed] = useState(false);
  
  // Looper states - déplacé ici pour éviter l’erreur "used before declaration"
  const [isLooping, setIsLooping] = useState(false);
  const [isLoopPlaying, setIsLoopPlaying] = useState(false);
  const [loopLayers, setLoopLayers] = useState<{
    videoUrl: string;
    midiEvents: MidiEvent[];
    startTime: number;
  }[]>([]);
  const loopRecorderRef = useRef<MediaRecorder | null>(null);
  const loopStreamRef = useRef<MediaStream | null>(null);
  const loopMidiEventsRef = useRef<MidiEvent[]>([]);
  const loopStartTimeRef = useRef<number>(0);
  const loopIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isLoopingRef = useRef(false); // Ref pour suivre l’état du looper

  // Pré-initialisation du flux média pour le looper
  useEffect(() => {
    // Demande d’accès à la caméra et au microphone dès le chargement de la page
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        console.log("Flux média pour le looper initialisé avec succès");
        loopStreamRef.current = stream;
      })
      .catch(err => {
        console.error("Erreur lors de l’initialisation du flux média pour le looper:", err);
      });
      
    // Nettoyage des tracks au démontage du composant
    return () => {
      if (loopStreamRef.current) {
        loopStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Chargement des vidéos sauvegardées depuis le profil
  useEffect(() => {
    const currentLearner = learners.find((l) => l.name === currentLearnerName);
    if (currentLearner?.recordings) {
      const videos = (currentLearner.recordings as any[]).map((recording) =>
        typeof recording === "object" && recording.videoUrl
          ? { ...recording, blobUrl: recording.videoUrl }
          : { name: recording, blobUrl: recording }
      );
      setRecordedVideos(videos);
    }
  }, [learners, currentLearnerName]);

  // Pour afficher la vidéo enregistrée du profil
  const selectedRecordedVideo = recordedVideos.find((v) => v.name === selectedRecordedName);

  // Références pour l’enregistrement MIDI général (lancé par le bouton blanc)
  const midiEventsRef = useRef<MidiEvent[]>([]);
  const midiInputRef = useRef<MIDIInput | null>(null);
  const recordStartTimeRef = useRef<number>(0);

  // Référence pour la sortie MIDI (pour la lecture)
  const midiOutputRef = useRef<MIDIOutput | null>(null);
  useEffect(() => {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess().then((midiAccess) => {
        const outputs = Array.from(midiAccess.outputs.values());
        let output = outputs.find(
          (out) =>
            out.name &&
            (out.name.toLowerCase().includes("disklavier") || out.name.toLowerCase().includes("yamaha"))
        );
        if (!output && outputs.length > 0) {
          output = outputs[0];
          console.warn("Port Disklavier non trouvé, utilisation du port :", output.name);
        }
        midiOutputRef.current = (output ?? null) as unknown as MIDIOutput;
      });
    }
  }, []);

  // Initialisation globale du port MIDI d’entrée
  useEffect(() => {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess().then((midiAccess) => {
        const inputs = Array.from(midiAccess.inputs.values());
        let input = inputs.find(
          (inp) =>
            inp.name &&
            (inp.name.toLowerCase().includes("disklavier") || inp.name.toLowerCase().includes("yamaha"))
        );
        if (!input && inputs.length > 0) {
          input = inputs[0];
          console.warn("Port MIDI d’entrée non trouvé pour Disklavier, utilisation du port :", input.name);
        }
        if (input) {
          midiInputRef.current = input as unknown as MIDIInput;
          // Utiliser le type d’événement correct avec une fonction d’adaptation
          input.onmidimessage = globalMidiHandler;
        }
      });
    }
  }, []);

  // Enregistrement général (bouton avec la boule blanche)
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordStream, setRecordStream] = useState<MediaStream | null>(null);

  const totalTime = selectedSound?.sections?.length
    ? selectedSound.sections.reduce((max: number, s: any) => Math.max(max, s.end), 0)
    : 60;

  // Ajout d’un ref pour suivre les timeouts programmés
  const scheduledTimeouts = useRef<NodeJS.Timeout[]>([]);
  const scheduleTimeout = (cb: () => void, delay: number) => {
    const id = setTimeout(cb, delay);
    scheduledTimeouts.current.push(id);
  };

  const playSection = (section: Section) => {
    if (!videoRef.current) return;
    if (videoRef.current.currentTime < section.start || videoRef.current.currentTime >= section.end) {
      videoRef.current.currentTime = section.start;
    }
    videoRef.current.playbackRate = playbackSpeed;
    scheduleTimeout(() => {
      videoRef.current?.play().catch((err) => console.error(err));
    }, videoDelayMs);
    const remaining = (section.end - videoRef.current.currentTime) / playbackSpeed;
    scheduleTimeout(() => {
      videoRef.current?.pause();
      if (selectedSound?.sections) {
        const currentIndex = selectedSound.sections.indexOf(section);
        if (currentIndex < selectedSound.sections.length - 1) {
          setCurrentSectionIndex(currentIndex + 1);
        }
      }
    }, remaining * 1000);
  };

  // Ajoutez ces états
  const [referenceMidiSequence, setReferenceMidiSequence] = useState<any[]>([]);
  const [performanceNoteColors, setPerformanceNoteColors] = useState<string[]>([]);

  // Modifiez playMidiSection pour stocker la séquence de référence
  const playMidiSection = (section: Section) => {
    if (!selectedSound || !selectedSound.midiUrl || !midiOutputRef.current) return;
    
    // Use the proxy for the MIDI URL
    const proxiedUrl = getProxiedUrl(selectedSound.midiUrl);
    
    fetch(proxiedUrl)
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        const midi = new Midi(buffer);
        let allNotes: any[] = [];
        midi.tracks.forEach((track) => {
          allNotes = allNotes.concat(track.notes);
        });
        // Filtrer les notes de la section
        const refNotes = allNotes
          .filter((note) => note.time >= section.start && note.time < section.end)
          .sort((a, b) => a.time - b.time);
        setReferenceMidiSequence(refNotes);
        // Envoi des messages MIDI selon la durée de la note
        refNotes.forEach((note) => {
          const offset = ((note.time - section.start) * 1000) / playbackSpeed;
          scheduleTimeout(() => {
            if (note.velocity > 0) {
              midiOutputRef.current?.send([0x90, note.midi, 0x7f]);
              if (note.duration > 0) {
                scheduleTimeout(() => {
                  midiOutputRef.current?.send([0x80, note.midi, 0x40]);
                }, (note.duration * 1000) / playbackSpeed);
              } else {
                midiOutputRef.current?.send([0x80, note.midi, 0x40]);
              }
            } else {
              midiOutputRef.current?.send([0x80, note.midi, 0x40]);
            }
          }, offset);
        });
        if (midi.tracks) {
          midi.tracks.forEach((track) => {
            if (track.controlChanges && track.controlChanges[64]) {
              track.controlChanges[64].forEach((pedal) => {
                if (pedal.time >= section.start && pedal.time < section.end) {
                  const offset = ((pedal.time - section.start) * 1000) / playbackSpeed;
                  scheduleTimeout(() => {
                    midiOutputRef.current?.send([0xB0, 64, Math.round(pedal.value * 127)]);
                  }, offset);
                }
              });
            }
          });
        }
        const sectionDurationMs = ((section.end - section.start) * 1000) / playbackSpeed;
        scheduleTimeout(() => {
          midiOutputRef.current?.send([0xB0, 64, 0]);
          midiOutputRef.current?.send([0xB0, 123, 0]);
        }, sectionDurationMs + 100);
      })
      .catch((err) => console.error("Erreur lors du chargement du MIDI pour la section", err));
  };

  // Fonction de comparaison des séquences, retourne le tableau de couleurs ou null
  const compareSequences = () => {
    if (referenceMidiSequence.length === 0) return null;
    const userEvents = performanceMIDIEventsRef.current.filter(
      (e) => (e.data[0] & 0xf0) === 0x90 && e.data[2] > 0
    );
    if (userEvents.length === 0) return null;
    const refSeq = [...referenceMidiSequence].sort((a, b) => a.time - b.time);
    const userSeq = [...userEvents].sort((a, b) => a.timestamp - b.timestamp);
    const refStart = refSeq[0].time, refEnd = refSeq[refSeq.length - 1].time;
    const refDuration = refEnd - refStart;
    const userStart = userSeq[0].timestamp, userEnd = userSeq[userSeq.length - 1].timestamp;
    const userDuration = userEnd - userStart;
    const count = Math.min(refSeq.length, userSeq.length);
    let differences: number[] = [];
    let colors: string[] = [];
    for (let i = 0; i < count; i++) {
      const refNote = refSeq[i];
      const userNote = userSeq[i];
      if (refNote.midi !== userNote.data[1]) {
        colors.push("red");
      } else {
        const refPct = ((refNote.time - refStart) / refDuration) * 100;
        const userPct = ((userNote.timestamp - userStart) / userDuration) * 100;
        const diff = Math.abs(refPct - userPct);
        differences.push(diff);
        colors.push(diff <= 5 ? "green" : "orange");
      }
    }
    const avgDiff = differences.length > 0 ? differences.reduce((acc, d) => acc + d, 0) / differences.length : 0;
    if (avgDiff > 50) {
      setPlaybackSpeed((prev) => Math.max(prev - 0.2, 0.1));
    }
    return colors;
  };

  // Rejoue les événements MIDI enregistrés lors du performance recording
  const playPerformanceMIDI = () => {
    if (!midiOutputRef.current || performanceMIDIEventsRef.current.length === 0) return;
    performanceMIDIEventsRef.current.forEach((event) => {
      scheduleTimeout(() => {
        midiOutputRef.current?.send(event.data);
      }, event.timestamp);
    });
  };

  // Lorsqu’une vignette est cliquée, on lance la lecture de la section.
  // À la fin, l’overlay passe à "Your turn now" et le performance recording démarre.
  const handlePlaySection = (section: Section) => {
    if (!selectedSound) return;
    
    // Suivi analytique: section jouée
    const sectionIndex = selectedSound.sections.indexOf(section);
    trackEvent(TrainingEventTypes.SECTION_PLAY, { 
      sectionIndex, 
      start: section.start, 
      end: section.end
    });
    trackEvent(TrainingEventTypes.SECTION_LISTEN, { sectionIndex });
    
    setCurrentSectionIndex(selectedSound.sections.indexOf(section));
    setOverlayMessage("Pay attention");
    if (videoRef.current) videoRef.current.currentTime = section.start;
    playSection(section);
    playMidiSection(section);
    const sectionDurationMs = ((section.end - section.start) * 1000) / playbackSpeed;
    
    // Enregistrer le temps d'écoute pour cette section
    trackSectionListeningTime(sectionIndex, sectionDurationMs);
    
    scheduleTimeout(() => {
      setOverlayMessage("Your turn now");
      trackEvent(TrainingEventTypes.SECTION_PERFORM, { sectionIndex });
      startPerformanceRecording(section);
    }, sectionDurationMs);
  };

  const handlePlayButton = () => {
    if (!selectedSound?.sections?.length) return;
    const section = selectedSound.sections[currentSectionIndex];
    handlePlaySection(section);
  };

  const handlePauseButton = () => {
    videoRef.current?.pause();
  };

  // Solution pour le problème Firebase lors de la lecture de la vidéo locale

// 1. D’abord, ajoutons un nouvel état pour indiquer si nous utilisons une vidéo locale ou distante
const [isLocalVideo, setIsLocalVideo] = useState(false);

// 2. Modifions handleListenPreviousButton pour définir cet état et pour s’assurer que la vidéo ne joue qu’une seule fois
const handleListenPreviousButton = () => {
  try {
    // Obtenir les données MIDI
    const storedMIDI = localStorage.getItem("localPerformanceMIDI");
    // Obtenir l’URL de la vidéo
    const storedVideoURL = localStorage.getItem("localPerformanceVideoURL");
    
    if (storedMIDI && storedVideoURL) {
      const recordingData = JSON.parse(storedMIDI);
      
      // Configurer les événements MIDI pour lecture unique
      performanceMIDIEventsRef.current = recordingData.midi || [];
      
      // IMPORTANT: Vérifier si l’URL est un blob: ou un data:
      if (storedVideoURL.startsWith('blob:') || 'data:') {
        // Si c’est une URL locale, utiliser directement l’URL sans passer par ContentMedia
        setPerformanceVideoURL(storedVideoURL);
        
        // IMPORTANT: indiquer qu’il s’agit d’une vidéo locale mais *PAS* en mode looper
        setIsLocalVideo(true);
        setIsLoopPlaying(false); // S’assurer que le mode boucle est désactivé
        
        // Afficher la vidéo
        setShowPerformancePlayback(true);
        
        // Planifier la lecture des événements MIDI (une seule fois)
        if (performanceMIDIEventsRef.current.length > 0 && midiOutputRef.current) {
          performanceMIDIEventsRef.current.forEach((event) => {
            scheduleTimeout(() => {
              midiOutputRef.current?.send(event.data);
            }, event.timestamp);
          });
        }
      } else {
        console.error("L’URL n’est pas une URL locale valide");
      }
    } else {
      console.log("Aucune performance trouvée dans le stockage local");
    }
  } catch (error) {
    console.error("Erreur lors du chargement depuis le stockage local:", error);
  }
};

  // Enregistrement général (bouton avec la boule blanche) - inchangé (upload sur Firebase)
  const handleRecordButton = async () => {
    if (!isRecording) {
      try {
        // Suivi analytique: début d’enregistrement
        trackEvent(TrainingEventTypes.RECORDING_START);
        
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            const base64data = reader.result as string;
            const dateObj = new Date();
            const day = String(dateObj.getDate()).padStart(2, "0");
            const month = String(dateObj.getMonth() + 1).padStart(2, "0");
            const year = dateObj.getFullYear();
            const hh = String(dateObj.getHours()).padStart(2, "0");
            const mm = String(dateObj.getMinutes()).padStart(2, "0");
            const ss = String(dateObj.getSeconds()).padStart(2, "0");
            const dateString = `${day}-${month}-${year}_${hh}h${mm}m${ss}`;
            const learnerName = currentLearnerName || "UnknownLearner";
            const songName = selectedSound?.title || "UnknownSong";
            const fileName = `${dateString}_${learnerName}_${songName}.webm`;
            
            try {
              // Upload video to Firebase Storage
              const videoUrl = await uploadVideo(fileName, base64data);
              
              // Upload MIDI data to Firebase Storage
              let midiUrl = "";
              if (midiEventsRef.current.length > 0) {
                midiUrl = await uploadMidiData(fileName.replace(".webm", ".json"), midiEventsRef.current);
              }
              
              // Add recording to learner’s profile
              const recordingData = { name: fileName, videoUrl, midiUrl };
              if (currentLearnerName) {
                await addRecordingToLearner(currentLearnerName, recordingData);
                
                // Update local state
                const newVideo: RecordedVideo = { name: fileName, blobUrl: videoUrl, midiUrl };
                setRecordedVideos(prev => [...prev, newVideo]);
                
                // Also update context
                const currentLearner = learners.find(l => l.name === currentLearnerName);
                if (currentLearner) {
                  const updatedLearner = {
                    ...currentLearner,
                    recordings: [...(currentLearner.recordings || []), recordingData]
                  };
                  await updateLearner(updatedLearner);
                }
              }
            } catch (err) {
              console.error("Error uploading video/MIDI to Firebase:", err);
            }
          };
        };
        
        recorder.start();
        console.log("Recording started...");
        setMediaRecorder(recorder);
        setRecordStream(stream);
        setIsRecording(true);
        midiEventsRef.current = [];
        recordStartTimeRef.current = performance.now();
        
        if (navigator.requestMIDIAccess) {
          navigator.requestMIDIAccess().then((midiAccess) => {
            const inputs = Array.from(midiAccess.inputs.values());
            let input = inputs.find(
              (inp) =>
                inp.name &&
                (inp.name.toLowerCase().includes("disklavier") || inp.name.toLowerCase().includes("yamaha"))
            );
            if (!input && inputs.length > 0) {
              input = inputs[0];
              console.warn("Port MIDI d’entrée non trouvé pour Disklavier, utilisation du port :", input.name);
            }
            if (input) {
              midiInputRef.current = input as unknown as MIDIInput;
              input.onmidimessage = globalMidiHandler;
            }
          });
        }
      } catch (err) {
        console.error("Could not record webcam/MIDI", err);
      }
    } else {
      if (mediaRecorder) mediaRecorder.stop();
      if (recordStream) recordStream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      setMediaRecorder(null);
      setRecordStream(null);
      if (midiInputRef.current) {
        midiInputRef.current.onmidimessage = globalMidiHandler;
      }
      console.log("Recording stopped.");
      
      // Suivi analytique: fin d’enregistrement
      trackEvent(TrainingEventTypes.RECORDING_STOP);
    }
  };

  // Enregistrement de performance (déclenché automatiquement après la section)
  // Le recording se lance quand "Your turn now" est affiché et se termine lorsque
  // le temps minimum de la section est écoulé ET qu’aucune touche (note on) n’est pressée pendant 2 secondes.
  const startPerformanceRecording = (section: Section) => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        performanceStreamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        performanceRecorderRef.current = recorder;
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            setPerformanceVideoURL(reader.result as string);
          };
        };
        recorder.start();
        setIsPerformanceRecording(true);
        // Réinitialiser les événements MIDI de performance
        performanceMIDIEventsRef.current = [];
        performanceRecordStartRef.current = performance.now();

        lastPerformanceEventRef.current = performance.now();
        if (midiInputRef.current) {
          midiInputRef.current.onmidimessage = (event) => {
            if (!event.data) return;
            const command = event.data[0] & 0xF0;
            const noteOrController = event.data[1];
            const velocity = event.data[2];
            // Enregistrer les "note on" (velocity > 0) et "note off" (0x80 ou 0x90 avec vélocité 0)
            if ((command === 0x90 && velocity > 0) || command === 0x80 || (command === 0x90 && velocity === 0)) {
              if (command === 0x90 && velocity > 0) {
                lastPerformanceEventRef.current = performance.now();
              }
              const timestamp = performance.now() - performanceRecordStartRef.current;
              performanceMIDIEventsRef.current.push({
                data: Array.from(event.data),
                timestamp,
              });
            }
            // Enregistrer également les événements de pédale (contrôle 64)
            else if (command === 0xB0 && noteOrController === 64) {
              const timestamp = performance.now() - performanceRecordStartRef.current;
              performanceMIDIEventsRef.current.push({
                data: Array.from(event.data),
                timestamp,
              });
            }
          };
        }
        const sectionDurationMs = ((section.end - section.start) * 1000) / playbackSpeed;
        const checkInactivity = () => {
          const now = performance.now();
          // Arrêter le recording si le temps minimum de la section est écoulé ET aucune touche (note on) n’a été pressée pendant 2 sec.
          if (now - performanceRecordStartRef.current >= sectionDurationMs && now - lastPerformanceEventRef.current >= 2000) {
            stopPerformanceRecording();
          } else {
            performanceStopTimeoutRef.current = setTimeout(checkInactivity, 100);
          }
        };
        performanceStopTimeoutRef.current = setTimeout(checkInactivity, 100);
      })
      .catch((err) => console.error("Erreur lors de l’obtention du stream pour la performance", err));
  };

  // Arrête le performance recording en stoppant le MediaRecorder et en libérant le flux
const stopPerformanceRecording = () => {
  if (performanceRecorderRef.current) {
    performanceRecorderRef.current.stop();
    performanceRecorderRef.current = null;
  }
  if (performanceStreamRef.current) {
    performanceStreamRef.current.getTracks().forEach((track) => track.stop());
    performanceStreamRef.current = null;
  }
  setIsPerformanceRecording(false);
  setOverlayMessage(null); // Effacer "Your turn now"
  
  const colors = compareSequences(); // Comparaison note par note
  if (colors) {
    const currentLearner = learners.find((l) => l.name === currentLearnerName);
    if (currentLearner && selectedSound) {
      let newEvaluations = currentLearner.evaluations ? { ...currentLearner.evaluations } : {};
      newEvaluations[selectedSound.id] = newEvaluations[selectedSound.id] || {};
      // Sauvegarder l’évaluation pour la section jouée
      newEvaluations[selectedSound.id][currentSectionIndex] = colors;
      const updatedLearner = { ...currentLearner, evaluations: newEvaluations };
      updateLearner(updatedLearner);

      // Suivi analytique: enregistrement du score
      const redCount = colors.filter(c => c === 'red').length;
      const orangeCount = colors.filter(c => c === 'orange').length;
      const greenCount = colors.filter(c => c === 'green').length;
      const totalNotes = colors.length;
      
      // Calculer un score sur 100
      const score = totalNotes > 0 
        ? Math.round((greenCount * 100 + orangeCount * 50) / totalNotes) 
        : 0;
        
      // Enregistrer le score et les statistiques détaillées
      trackEvent(TrainingEventTypes.SECTION_SCORE, { 
        sectionIndex: currentSectionIndex, 
        score,
        stats: { 
          total: totalNotes,
          red: redCount, 
          orange: orangeCount, 
          green: greenCount 
        }
      });
      
      // Enregistrer aussi comme métrique de section
      trackSectionMetric(currentSectionIndex, 'score', score);
      trackSectionMetric(currentSectionIndex, 'red_notes', redCount);
      trackSectionMetric(currentSectionIndex, 'orange_notes', orangeCount);
      trackSectionMetric(currentSectionIndex, 'green_notes', greenCount);
    }
  }
  
  // Réinitialiser les handlers MIDI
  if (midiInputRef.current) {
    midiInputRef.current.onmidimessage = globalMidiHandler;
  }
  
  // Nettoyer les timeouts
  if (performanceStopTimeoutRef.current) {
    clearTimeout(performanceStopTimeoutRef.current);
  }
  
  setIsLocalVideo(true);
};

  // Calibration (gestion des paramètres de transformation) - mise à jour pour Firebase
  const [calibrationConfig, setCalibrationConfig] = useState<CalibrationConfig | null>(null);

  useEffect(() => {
    async function loadCalibration() {
      try {
        setLoading(true);
        setMainVideoReady(false); // Réinitialiser l’état de préparation
        const config = await getCalibrationConfig("calibration-recorded");
        setCalibrationConfig(config);
        // Ne pas mettre à true ici, cela sera fait par l’élément vidéo lui-même
      } catch (err) {
        console.error("Erreur lors du chargement de la configuration depuis Firebase:", err);
        // Fallback to localStorage
        const storedConfig = localStorage.getItem("calibration-recorded");
        if (storedConfig) {
          try {
            const parsed = JSON.parse(storedConfig);
            setCalibrationConfig(parsed);
          } catch (parseErr) {
            console.error("Erreur lors du parsing de la config locale:", parseErr);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    
    loadCalibration();
  }, []);

  // Sauvegarde automatique dans le local storage de la vidéo et des événements MIDI dès que la performance est chargée
  useEffect(() => {
    if (performanceVideoURL) {
      try {
        // Sauvegarder uniquement les données MIDI, qui sont beaucoup plus légères
        const recordingData = {
          midi: performanceMIDIEventsRef.current
        };
        
        // Stocker séparément la vidéo dans IndexedDB, qui a une limite bien plus élevée
        localStorage.setItem("localPerformanceMIDI", JSON.stringify(recordingData));
        
        // Pour la vidéo, créer un objet URL au lieu de stocker le data URL complet
        if (performanceVideoURL.startsWith('data:')) {
          // Extraire le blob de data:URL
          const byteString = atob(performanceVideoURL.split(',')[1]);
          const mimeType = performanceVideoURL.split(',')[0].split(':')[1].split(';')[0];
          const arrayBuffer = new ArrayBuffer(byteString.length);
          const byteArray = new Uint8Array(arrayBuffer);
          
          for (let i = 0; i < byteString.length; i++) {
            byteArray[i] = byteString.charCodeAt(i);
          }
          
          const blob = new Blob([arrayBuffer], { type: mimeType });
          
          // Créer un URL d’objet et le stocker
          const objectURL = URL.createObjectURL(blob);
          localStorage.setItem("localPerformanceVideoURL", objectURL);
        }
      } catch (error) {
        console.error("Erreur lors de la sauvegarde de la performance :", error);
      }
    }
  }, [performanceVideoURL]);

  let absoluteCrop: { x: number; y: number; width: number; height: number } | null = null;
  let absolutePoints: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
  } | null = null;
  let absoluteVideoOffset: { x: number; y: number } | null = null;
  if (calibrationConfig) {
    const displayWidth = 640;
    const scaleFactor = displayWidth / calibrationConfig.baseWidth;
    const displayHeight = calibrationConfig.baseHeight * scaleFactor;
    absoluteCrop = {
      x: calibrationConfig.normalizedCrop.x * displayWidth,
      y: calibrationConfig.normalizedCrop.y * displayHeight,
      width: calibrationConfig.normalizedCrop.width * displayWidth,
      height: calibrationConfig.normalizedCrop.height * displayHeight,
    };
    absolutePoints = {
      topLeft: { x: calibrationConfig.normalizedPoints.topLeft.x * displayWidth, y: calibrationConfig.normalizedPoints.topLeft.y * displayHeight },
      topRight: { x: calibrationConfig.normalizedPoints.topRight.x * displayWidth, y: calibrationConfig.normalizedPoints.topRight.y * displayHeight },
      bottomRight: { x: calibrationConfig.normalizedPoints.bottomRight.x * displayWidth, y: calibrationConfig.normalizedPoints.bottomRight.y * displayHeight },
      bottomLeft: { x: calibrationConfig.normalizedPoints.bottomLeft.x * displayWidth, y: calibrationConfig.normalizedPoints.bottomLeft.y * displayHeight },
    };
    absoluteVideoOffset = {
      x: calibrationConfig.normalizedVideoOffset.x * displayWidth,
      y: calibrationConfig.normalizedVideoOffset.y * displayHeight,
    };
  }

  const [recordedVideoContainerPos, setRecordedVideoContainerPos] = useState<ContainerPos>({ x: 0, y: 0 });
  const [recordedVideoPerspectivePoints, setRecordedVideoPerspectivePoints] = useState<Points | null>(null);
  
  // Load position and perspective points from Firebase
  useEffect(() => {
    if (!currentLearnerName || !soundId) return;
    
    async function loadPositionConfig() {
      try {
        // Add type assertions to ensure TypeScript knows these values are strings
        const config = await getPositionConfig(
          currentLearnerName as string, 
          soundId as string
        );
        if (config) {
          setRecordedVideoContainerPos(config.position);
          setRecordedVideoPerspectivePoints(config.perspectivePoints);
        } else {
          // Fallback to localStorage
          const saved = localStorage.getItem("recordedVideoContainerPos");
          const stored = localStorage.getItem("recordedVideoPerspectivePoints");
          
          if (saved) {
            try { setRecordedVideoContainerPos(JSON.parse(saved)); } 
            catch { setRecordedVideoContainerPos({ x: 0, y: 0 }); }
          }
          
          if (stored) {
            try { setRecordedVideoPerspectivePoints(JSON.parse(stored)); }
            catch { setRecordedVideoPerspectivePoints(null); }
          }
        }
      } catch (err) {
        console.error("Error loading position config:", err);
      }
    }
    
    loadPositionConfig();
  }, [currentLearnerName, soundId]);

  // Modified handleSavePosition to use Firebase
  const handleSavePosition = async () => {
    if (!currentLearnerName || !soundId) {
      return;
    }
    try {
      await savePositionConfig(
        currentLearnerName,
        soundId,
        {
          position: recordedVideoContainerPos,
          perspectivePoints: recordedVideoPerspectivePoints
        }
      );
    } catch (err) {
      console.error("Erreur lors de la sauvegarde de la position :", err);
      
      // Fallback to localStorage
      try {
        localStorage.setItem("recordedVideoContainerPos", JSON.stringify(recordedVideoContainerPos));
        localStorage.setItem("recordedVideoPerspectivePoints", JSON.stringify(recordedVideoPerspectivePoints));
      } catch (localErr) {
        console.error("Erreur lors de la sauvegarde locale:", localErr);
      }
    }
  };

  // Lecture des événements MIDI pour la vidéo enregistrée du profil (si sélectionnée)
  useEffect(() => {
    if (selectedRecordedName && selectedRecordedVideo?.midiUrl && midiOutputRef.current) {
      setTimeout(() => {
        // Use the proxy for the MIDI URL
        const proxiedUrl = getProxiedUrl(selectedRecordedVideo.midiUrl!);
        
        fetch(proxiedUrl)
          .then((res) => res.json())
          .then((midiData) => {
            midiData.forEach((event: MidiEvent) => {
              setTimeout(() => {
                midiOutputRef.current?.send(event.data);
                console.log(`Message MIDI envoyé: ${event.data} à ${event.timestamp} ms`);
              }, event.timestamp);
            });
          })
          .catch((err) => console.error("Erreur lors du chargement du MIDI", err));
      }, 300);
    }
    
  }, [selectedRecordedName, selectedRecordedVideo]);

  // Détermination de la couleur à utiliser dans la timeline (seulement pour la section jouée)
  const currentEvaluation = (() => {
    const currentLearner = learners.find((l) => l.name === currentLearnerName);
    if (selectedSound && currentLearner && currentLearner.evaluations && currentLearner.evaluations[selectedSound.id]) {
      return currentLearner.evaluations[selectedSound.id][currentSectionIndex] || performanceNoteColors;
    }
    return performanceNoteColors;
  })();

  // Nouveaux états pour la gestion des notes sur les recordings
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [currentRecordingNote, setCurrentRecordingNote] = useState("");
  const [selectedRecordingForNote, setSelectedRecordingForNote] = useState<string | null>(null);
  
  // Fonction qui ouvre le modal et charge la note existante (si présente)
  const openNoteModal = (recordingName: string) => {
    setSelectedRecordingForNote(recordingName);
    const currentLearner = learners.find(l => l.name === currentLearnerName);
    let note = "";
    if (currentLearner) {
      const rec = currentLearner.recordings.find(r => r.name === recordingName);
      if (rec && (rec as any).notes) note = (rec as any).notes;
    }
    setCurrentRecordingNote(note);
    setNoteModalOpen(true);
  };
  
  // Fonction pour sauvegarder la note associée au recording
  const saveRecordingNote = async () => {
    if (!selectedRecordingForNote || !currentLearnerName) return;
    
    const currentLearner = learners.find(l => l.name === currentLearnerName);
    if (currentLearner) {
      // Mise à jour de l’enregistrement pour y ajouter la note
      const updatedRecordings = currentLearner.recordings.map(r => {
        if (r.name === selectedRecordingForNote) {
          return { ...r, notes: currentRecordingNote }; // notes ajouté juste après midiUrl
        }
        return r;
      });
      const updatedLearner = { ...currentLearner, recordings: updatedRecordings };
      await updateLearner(updatedLearner);
    }
    setNoteModalOpen(false);
  };

  // Nouvelle fonction pour supprimer un recording - mise à jour pour Firebase
  const handleDeleteRecording = async (recordingName: string) => {
    if (!currentLearnerName) return;
    
    try {
      // Use the correct API route format
      const res = await fetch(`/api/learners/${currentLearnerName}/recordings/${encodeURIComponent(recordingName)}`, {
        method: "DELETE",
      });
      
      if (res.ok) {
        // Mise à jour locale du learner : filtrer le recording supprimé
        const currentLearner = learners.find(l => l.name === currentLearnerName);
        if (currentLearner) {
          const updatedRecordings = currentLearner.recordings.filter(r => r.name !== recordingName);
          const updatedLearner = { ...currentLearner, recordings: updatedRecordings };
          await updateLearner(updatedLearner);
          setRecordedVideos(recordedVideos.filter(rv => rv.name !== recordingName));
        }
      }
    } catch (err) {
      console.error("Erreur lors de la suppression du recording:", err);
    }
  };

  // Transformation du bouton pause en bouton stop
  const handleStop = () => {
    // 1) Réinitialise la vidéo principale et la renvoie (pause + t=0) sur l’écran secondaire
    if (videoRef.current && calibrationConfig && absoluteCrop && absolutePoints && absoluteVideoOffset) {
      // Met la vidéo par défaut en pause et la remet au début
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      // Envoie ce même élément sur le second écran (clone + synchro)
      sendVideoToSecondScreen(videoRef.current, {
        crop: absoluteCrop,
        perspectivePoints: absolutePoints,
        videoOffset: absoluteVideoOffset,
        baseWidth: 640,
        baseHeight: (absoluteCrop.height / absoluteCrop.width) * 640
      });
    }
  
    // 2) Annule tous les timeouts pour s’assurer qu’il n’y a plus de play/pause/seek programmés
    scheduledTimeouts.current.forEach((timeout) => clearTimeout(timeout));
    scheduledTimeouts.current = [];
  
    // 3) Masque toute overlay ou playback de performance en cours
    setOverlayMessage(null);
    setShowPerformancePlayback(false);
    setSelectedRecordedName("");
  
    // 4) Met la vidéo enregistrée (dropdown) en pause
    if (recordedVideoRef.current) {
      recordedVideoRef.current.pause();
    }
  
    // 5) Stoppe toute lecture MIDI en cours sur le Disklavier
    if (midiOutputRef.current) {
      // All Notes Off
      midiOutputRef.current.send([0xB0, 123, 0]);
      // Reset controllers
      midiOutputRef.current.send([0xB0, 121, 0]);
    }
  
    // 6) Stoppe et ré-initialise les enregistrements (général, performance, loop)
    if (isRecording && mediaRecorder) {
      mediaRecorder.stop();
      recordStream?.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      setMediaRecorder(null);
      setRecordStream(null);
    }
    if (isPerformanceRecording && performanceRecorderRef.current) {
      performanceRecorderRef.current.stop();
      performanceStreamRef.current?.getTracks().forEach((t) => t.stop());
      setIsPerformanceRecording(false);
    }
    if (isLooping) {
      // arrête la loop en cours
      if (loopRecorderRef.current) loopRecorderRef.current.stop();
      if (loopStreamRef.current) loopStreamRef.current.getTracks().forEach((t) => t.stop());
      setIsLooping(false);
      isLoopingRef.current = false;
    }
    // Stoppe aussi toute lecture de loop
    stopLoopPlayback();
  
    // 7) Remet le handler MIDI global (pour les futures sessions)
    if (midiInputRef.current) {
      midiInputRef.current.onmidimessage = globalMidiHandler;
    }
  };

  // Ajout de la fonction handleSavePerformance - inchangée (upload sur Firebase)
  const handleSavePerformance = async () => {
    if (!performanceVideoURL || !currentLearnerName) return;
    
    // Si l'option "Save to Firebase" est désactivée, ne pas uploader vers Firebase
    if (!shouldSaveToFirebase()) {
      console.log("Firebase save désactivé, aucune donnée n'a été sauvegardée");
      // Fermer la vidéo de performance simplement
      setPerformanceVideoURL(null);
      setShowPerformancePlayback(false);
      return;
    }
    
    const dateObj = new Date();
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();
    const hh = String(dateObj.getHours()).padStart(2, "0");
    const mm = String(dateObj.getMinutes()).padStart(2, "0");
    const ss = String(dateObj.getSeconds()).padStart(2, "0");
    const dateString = `${day}-${month}-${year}_${hh}h${mm}m${ss}`;
    const learnerName = currentLearnerName;
    const songName = selectedSound?.title || "UnknownSong";
    const fileName = `${dateString}_${learnerName}_${songName}.webm`;
    
    try {
      // Si c’est une URL de type blob:, nous devons d’abord récupérer le contenu
      if (performanceVideoURL.startsWith('blob:')) {
        try {
          const response = await fetch(performanceVideoURL);
          const blob = await response.blob();
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            try {
              // Supprimer le préfixe pour avoir uniquement la partie base64
              const base64data = reader.result as string;
              const base64Clean = base64data.split(',')[1];
              
              uploadAndFinish(base64Clean);
            } catch (err) {
              console.error("Erreur lors de la conversion blob à base64:", err);
            }
          };
        } catch (err) {
          console.error("Erreur lors de la récupération du blob:", err);
        }
      } else if (performanceVideoURL.startsWith('data:')) {
        // Pour les data URLs, extraire directement la partie base64
        const base64Clean = performanceVideoURL.split(',')[1];
        uploadAndFinish(base64Clean);
      } else {
        // Pour les URLs externes
        uploadAndFinish(performanceVideoURL);
      }
    } catch (err) {
      console.error("Error saving performance to Firebase:", err);
    }
    
    // Fonction utilitaire pour terminer le processus d’upload
    async function uploadAndFinish(videoData: string) {
      try {
        // Upload video to Firebase Storage
        const videoUrl = await uploadVideo(fileName, videoData);
        
        // Upload MIDI data to Firebase Storage
        let midiUrl = "";
        if (performanceMIDIEventsRef.current.length > 0) {
          midiUrl = await uploadMidiData(fileName.replace(".webm", ".json"), performanceMIDIEventsRef.current);
        }
        
        // Add recording to learner’s profile
        const recordingData = { name: fileName, videoUrl, midiUrl };
        await addRecordingToLearner(learnerName, recordingData);
        
        // Update local state
        const newVideo: RecordedVideo = { name: fileName, blobUrl: videoUrl, midiUrl };
        setRecordedVideos(prev => [...prev, newVideo]);
        
        // Also update context
        const currentLearner = learners.find(l => l.name === currentLearnerName);
        if (currentLearner) {
          const updatedLearner = {
            ...currentLearner,
            recordings: [...(currentLearner.recordings || []), recordingData]
          };
          await updateLearner(updatedLearner);
        }
        
        // Réinitialiser la performance affichée pour réafficher la vidéo de base
        setPerformanceVideoURL(null);
        setShowPerformancePlayback(false);
        
      } catch (err) {
        console.error("Error uploading to Firebase:", err);
      }
    }
  };

  // Update the onPointsChange handler to use the new handleCalibrationPointsChange function
  const handleCalibrationPointsChange = (newPoints: Points) => {
    if (!shouldSaveToFirebase()) {
      console.log("Points de calibration non sauvegardés (Firebase désactivé)");
      return; // Ne pas sauvegarder si Firebase est désactivé
    }
    
    // Limiter le nombre de sauvegardes avec un debounce
    if (selectedSound && Date.now() - lastCalibrationSaveTime.current > 2000) {
      lastCalibrationSaveTime.current = Date.now();
      const updatedSound = { 
        ...selectedSound, 
        calibration: { 
          ...selectedSound.calibration,
          points: newPoints 
        } 
      };
      
      console.log("Saving new calibration points to sound:", updatedSound.id);
      updateSound(updatedSound)
        .then(() => console.log("Successfully saved calibration points"))
        .catch(err => console.error("Error saving calibration points:", err));
    }
  };

  useEffect(() => {
    if (!selectedSound?.videoUrl) return;
    
    // On précharge la vidéo dans un élément séparé pour obtenir ses vraies dimensions
    const preloadVideo = document.createElement('video');
    preloadVideo.src = selectedSound.videoUrl;
    preloadVideo.muted = true;
    preloadVideo.style.display = 'none';
    
    // Quand les métadonnées sont chargées, on a les dimensions
    preloadVideo.onloadedmetadata = () => {
      console.log("Vidéo préchargée avec dimensions:", preloadVideo.videoWidth, "x", preloadVideo.videoHeight);

      // Stocker l’élément vidéo pour référence
      videoElRef.current = preloadVideo;
      
      // Marquer que la vidéo est prête à être utilisée
      setVideoLoading(false);
      
      // Après un court délai supplémentaire pour s’assurer que tout est bien calculé
      setTimeout(() => {
        setMainVideoReady(true);
      }, 400);
    };
    
    // Lancer le chargement
    document.body.appendChild(preloadVideo);
    preloadVideo.load();
    
    // Nettoyer l’élément au démontage
    return () => {
      document.body.removeChild(preloadVideo);
      closeSecondScreen();
    };
  }, [selectedSound?.videoUrl]);

  
  // Ajoutons des fonctions utilitaires pour gérer IndexedDB pour les vidéos de loop
const openLoopDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('mirrorFugueLoopsDB', 1);
    
    request.onerror = () => reject(new Error("Impossible d’ouvrir la base de données"));
    
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains('loops')) {
        db.createObjectStore('loops', { keyPath: 'id' });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
  });
};

const saveLoopToIndexedDB = async (id: string, videoBlob: Blob): Promise<void> => {
  try {
    const db = await openLoopDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['loops'], 'readwrite');
      const store = transaction.objectStore('loops');
      
      const request = store.put({ id, videoBlob });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Erreur lors de l’enregistrement de la vidéo"));
      
      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error("Erreur lors de la sauvegarde dans IndexedDB:", error);
    throw error;
  }
};

const getLoopFromIndexedDB = async (id: string): Promise<Blob | null> => {
  try {
    const db = await openLoopDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['loops'], 'readonly');
      const store = transaction.objectStore('loops');
      
      const request = store.get(id);
      
      request.onsuccess = () => {
        resolve(request.result?.videoBlob || null);
      };
      
      request.onerror = () => reject(new Error("Erreur lors de la récupération de la vidéo"));
      
      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error("Erreur lors de la récupération depuis IndexedDB:", error);
    return null;
  }
};

const deleteLoopFromIndexedDB = async (id: string): Promise<void> => {
  try {
    const db = await openLoopDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['loops'], 'readwrite');
      const store = transaction.objectStore('loops');
      
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Erreur lors de la suppression de la vidéo"));
      
      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error("Erreur lors de la suppression depuis IndexedDB:", error);
    throw error;
  }
};

const handleLoopRecording = () => {
  if (!isLoopingRef.current) {
    // si on est sur la 2ᵉ+ couche, relance la boucle avant de record
    if (loopLayers.length > 0) startLoopPlayback(loopLayers);
    startLoopRecord();
  } else {
    stopLoopRecord();
  }
};



// Fonction pour démarrer/arrêter la lecture des loops
const handleLoopPlayback = () => {
  if (!isLoopPlaying) {
    startLoopPlayback(loopLayers);
  } else {
    stopLoopPlayback();
  }
};

// Fonction pour supprimer la dernière couche
const handleRemoveLastLayer = async () => {
  if (loopLayers.length === 0) return;
  
  // Arrêter toute lecture en cours
  stopLoopPlayback();
  
  // Supprimer la dernière couche
  const updatedLayers = loopLayers.slice(0, -1);
  setLoopLayers(updatedLayers);
  
  // Supprimer de IndexedDB et localStorage
  try {
    const layerId = `loop_${loopLayers.length - 1}`;
    await deleteLoopFromIndexedDB(layerId);
    
    // Mettre à jour localStorage
    localStorage.setItem("mirrorFugueLoopLayers", JSON.stringify(updatedLayers.map((layer, index) => ({
      ...layer,
      videoUrl: `loop_${index}`
    }))));
  } catch (error) {
    console.error("Erreur lors de la suppression de la couche:", error);
  }
  
  // Si des couches restent, redémarrer la lecture
  if (updatedLayers.length > 0) {
    startLoopPlayback(updatedLayers);
  }
};

// Fonction pour démarrer la lecture des loops avec correction pour assurer que le piano joue
const startLoopPlayback = async (layers: any[]) => {
  if (layers.length === 0) return;
  
  // Arrêter toute lecture en cours
  stopLoopPlayback();
  
  try {
    // On prend toujours la dernière couche pour la vidéo
    const lastLayer = layers[layers.length - 1];
    const layerId = `loop_${layers.length - 1}`;
    
    // Récupérer le blob de IndexedDB
    const videoBlob = await getLoopFromIndexedDB(layerId);
    
    if (videoBlob) {
      const videoUrl = URL.createObjectURL(videoBlob);
      
      // Afficher la vidéo de la dernière couche
      setPerformanceVideoURL(videoUrl);
      setShowPerformancePlayback(true);
      setIsLocalVideo(true);
      
      // Collecter tous les événements MIDI de toutes les couches
      let allMidiEvents: { data: number[], timestamp: number }[] = [];
      layers.forEach(layer => {
        if (layer.midiEvents && Array.isArray(layer.midiEvents)) {
          // Copier les événements pour éviter de modifier les originaux
          allMidiEvents = allMidiEvents.concat(layer.midiEvents.map((event: MidiEvent) => ({...event})));
        }
      });
      
      // Trier par timestamp pour s’assurer qu’ils sont joués dans l’ordre
      allMidiEvents.sort((a, b) => a.timestamp - b.timestamp);
      
      console.log(`Total d'événements MIDI à jouer: ${allMidiEvents.length}`);
      
      // Calculer la durée totale de la plus longue séquence
      const maxDuration = allMidiEvents.length > 0 
        ? Math.max(...allMidiEvents.map(e => e.timestamp)) + 2000 // +2s pour s’assurer que tout est joué
        : 5000; // Durée par défaut de 5 secondes
      
      console.log(`Durée totale de la séquence MIDI: ${maxDuration}ms`);
      
      // Fonction pour jouer tous les événements MIDI
      const playMidiEvents = () => {
        // S’assurer qu’il n’y a pas de notes bloquées
        if (midiOutputRef.current) {
          // Envoyer All Notes Off et reset controllers
          midiOutputRef.current.send([0xB0, 123, 0]);
          midiOutputRef.current.send([0xB0, 121, 0]);
        }
        
        // Programmer la lecture de chaque événement MIDI avec le bon timing
        allMidiEvents.forEach(event => {
          setTimeout(() => {
            if (midiOutputRef.current && Array.isArray(event.data)) {
              console.log(`Envoi MIDI [${Date.now() % 10000}]: [${event.data.join(', ')}] à t=${event.timestamp}ms`);
              try {
                midiOutputRef.current.send(event.data);
              } catch (err) {
                console.error("Erreur lors de l’envoi MIDI:", err);
              }
            }
          }, event.timestamp);
        });
        
        console.log("Tous les événements MIDI ont été programmés");
      };
      
      // Fonction pour démarrer la lecture synchronisée
      const playLoopContent = () => {
        if (loopVideoRef.current) {
          console.log("Démarrage de la lecture synchronisée vidéo+MIDI");
          
          // Réinitialiser la vidéo
          loopVideoRef.current.currentTime = 0;
          
          const playPromise = loopVideoRef.current.play();
          playPromise.then(() => {
            console.log("La lecture vidéo a démarré, lancement des événements MIDI");
            playMidiEvents();
          }).catch(err => {
            console.error("Erreur lors de la lecture de la vidéo:", err);
          });
        }
      };
      
      
      // Configurer la loop
      const setupLoop = () => {
        if (loopVideoRef.current) {
          // Configurer le handler pour détecter la fin de la vidéo
          loopVideoRef.current.onended = () => {
            console.log("Vidéo terminée, redémarrage de la loop");
            playLoopContent();
          };
          
          // Démarrage initial
          playLoopContent();
        }
      };
      
      // Attendre que la vidéo soit chargée avant de commencer
      if (loopVideoRef.current) {
        loopVideoRef.current.onloadeddata = () => {
          console.log("Vidéo chargée, configuration de la loop");
          setupLoop();
        };
      }      
      setIsLoopPlaying(true);
    } else {
      console.error("Vidéo non trouvée dans IndexedDB");
    }
  } catch (error) {
    console.error("Erreur lors du démarrage de la lecture:", error);
  }
};

// Fonction pour arrêter la lecture des loops avec améliorations pour nettoyer correctement
const stopLoopPlayback = () => {
  console.log("Arrêt de la lecture de loop");

  // couper tous les timeouts MIDI en attente
  scheduledTimeouts.current.forEach(clearTimeout);
  scheduledTimeouts.current = [];


  // Arrêter l’intervalle de boucle
  if (loopIntervalRef.current) {
    clearInterval(loopIntervalRef.current);
    loopIntervalRef.current = null;
  }
  
  // Arrêter la vidéo
  if (loopVideoRef.current) {
    loopVideoRef.current.pause();
    
    // Supprimer les handlers d’événements pour éviter des problèmes
    loopVideoRef.current.onended = null;
    loopVideoRef.current.onloadeddata = null;
  }
  
  // Tout arrêter (toutes les notes off) et réinitialiser les contrôleurs
  if (midiOutputRef.current) {
    midiOutputRef.current.send([0xB0, 123, 0]); // All Notes Off
    midiOutputRef.current.send([0xB0, 121, 0]); // Reset All Controllers
  }
  
  setIsLoopPlaying(false);
  setShowPerformancePlayback(false);
};

// Charger les couches précédemment sauvegardées depuis localStorage
useEffect(() => {
  const loadLoopLayers = async () => {
    try {
      const savedLayers = localStorage.getItem("mirrorFugueLoopLayers");
      if (savedLayers) {
        const parsedLayers = JSON.parse(savedLayers);
        
        // Récupérer tous les blobs vidéo depuis IndexedDB
        const restoredLayers = await Promise.all(parsedLayers.map(async (layer: any, index: number) => {
          const layerId = layer.videoUrl || `loop_${index}`;
          const videoBlob = await getLoopFromIndexedDB(layerId);
          
          return {
            ...layer,
            videoUrl: videoBlob ? URL.createObjectURL(videoBlob) : ''
          };
        }));
        
        setLoopLayers(restoredLayers.filter((layer: any) => layer.videoUrl));
      }
    } catch (error) {
      console.error("Erreur lors du chargement des loops:", error);
    }
  };
  
  loadLoopLayers();
}, []);

// Ajoutons une référence pour suivre l’état de la pédale gauche
const leftPedalRef = useRef<boolean>(false);

// Gestionnaire MIDI global : notes et pédale gauche
const globalMidiHandler = (ev: MIDIMessageEvent) => {
  if (!ev.data) return;
  const [status, data1, data2] = ev.data;
  
  // Pédale gauche (control 67) - Détection améliorée
  if ((status & 0xF0) === 0xB0 && data1 === 67) {
    const pedalDown = data2 > 64;
    
    // Si la pédale est enfoncée (front montant) et n’était pas déjà enfoncée
    if (pedalDown && !leftPedalRef.current) {
      leftPedalRef.current = true;
      setLeftPedalPressed(true);
      
      // La pédale gauche déclenche uniquement l’enregistrement/arrêt de loop
      if (!isLoopingRef.current) {
        // Démarrer l’enregistrement
        startLoopRecord();
      } else {
        // Arrêter l’enregistrement
        stopLoopRecord();
      }
    }
    // Si la pédale est relâchée (front descendant) et était enfoncée
    else if (!pedalDown && leftPedalRef.current) {
      leftPedalRef.current = false;
      setLeftPedalPressed(false);
    }
    return; // Ne pas traiter davantage cet événement
  }
  
  // Envoyer immédiatement l’événement MIDI au port de sortie pour le jeu en direct
  if (midiOutputRef.current) {
    midiOutputRef.current.send(ev.data);
  }
  
  // Enregistrement global (bouton blanc)
  const ts = performance.now() - recordStartTimeRef.current;
  midiEventsRef.current.push({ data: Array.from(ev.data), timestamp: ts });
  
  // Enregistrement de loop si actif
  if (isLoopingRef.current) {
    const lts = performance.now() - loopStartTimeRef.current;
    loopMidiEventsRef.current.push({ data: Array.from(ev.data), timestamp: lts });
  }
};

const startLoopRecord = () => {
  if (!loopStreamRef.current) {
    console.error("Stream Looper non disponible");
    return;
  }

  console.log("Démarrage de l’enregistrement loop");

  // --- 1) Fusion de la première couche MIDI (si elle existe) ---
  // on prend uniquement la couche #0, pour l’effet “stack”
  const firstLayerMidi = loopLayers[0]?.midiEvents || [];
  // on clone pour ne pas modifier l’original
  loopMidiEventsRef.current = firstLayerMidi.map(ev => ({
    data: [...ev.data],
    timestamp: ev.timestamp
  }));

  // on note le timestamp de démarrage
  loopStartTimeRef.current = performance.now();

  // --- 2) Configuration du MediaRecorder pour la vidéo ---
  const recorder = new MediaRecorder(loopStreamRef.current!);
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // --- 3) IMPORTANT: Modifier le gestionnaire MIDI global pour capturer aussi les événements de la lecture ---
  // Stocker le gestionnaire MIDI original pour le restaurer plus tard
  const originalMidiHandler = midiInputRef.current?.onmidimessage;
  
  // Créer un nouveau gestionnaire qui capture tout
  const recordAllMidiHandler = (ev: MIDIMessageEvent) => {
    if (!ev.data) return;
    const [status, data1, data2] = ev.data;
    
    // Envoyer l’événement au port de sortie comme d’habitude
    if (midiOutputRef.current) {
      midiOutputRef.current.send(ev.data);
    }
    
    // Enregistrer TOUS les événements MIDI dans loopMidiEventsRef, 
    // qu’ils viennent du clavier ou de la lecture de la loop existante
    const lts = performance.now() - loopStartTimeRef.current;
    loopMidiEventsRef.current.push({ data: Array.from(ev.data), timestamp: lts });
    
    // On continue de traiter pour l’enregistrement global
    const ts = performance.now() - recordStartTimeRef.current;
    midiEventsRef.current.push({ data: Array.from(ev.data), timestamp: ts });
    
    // Gérer la pédale gauche pour stopper l’enregistrement si nécessaire
    if ((status & 0xF0) === 0xB0 && data1 === 67) {
      const pedalDown = data2 > 64;
      if (pedalDown && !leftPedalRef.current) {
        leftPedalRef.current = true;
        setLeftPedalPressed(true);
      } else if (!pedalDown && leftPedalRef.current) {
        leftPedalRef.current = false;
        setLeftPedalPressed(false);
        // Si c’était une relâche de pédale gauche, on stoppe l’enregistrement
        if (isLoopingRef.current) {
          stopLoopRecord();
        }
      }
    }
  };

  // Installer notre gestionnaire sur l’entrée MIDI
  if (midiInputRef.current) {
    midiInputRef.current.onmidimessage = recordAllMidiHandler;
  }
  
  // Installer aussi notre gestionnaire pour capturer les messages envoyés par midiOutputRef
  // Sauvegarder l’implémentation originale de send
  const originalSend = midiOutputRef.current?.send;
  if (midiOutputRef.current && originalSend) {
    // Remplacer par notre version qui capture les données
    midiOutputRef.current.send = function(data) {
      // Appeler l’implémentation originale
      originalSend.call(this, data);
      
      // Enregistrer également cet événement s’il vient de la lecture de loop
      // et n’a pas déjà été capturé par l’input handler
      if (isLoopingRef.current && Array.isArray(data)) {
        const lts = performance.now() - loopStartTimeRef.current;
        loopMidiEventsRef.current.push({ data: Array.from(data), timestamp: lts });
      }
    };
  }

  recorder.onstop = async () => {
    // Restaurer les handlers MIDI originaux
    if (midiInputRef.current) {
      midiInputRef.current.onmidimessage = originalMidiHandler || globalMidiHandler;
    }
    
    // Restaurer l’implémentation originale de send
    if (midiOutputRef.current && originalSend) {
      midiOutputRef.current.send = originalSend;
    }

    if (chunks.length === 0) {
      return;
    }

    // Création du blob et de la nouvelle "couche" fusionnée
    const blob = new Blob(chunks, { type: "video/webm" });
    const videoUrl = URL.createObjectURL(blob);

    // on récupère TOUT le MIDI qu’on a dans loopMidiEventsRef.current
    const mergedMidiEvents = [...loopMidiEventsRef.current];
    // on peut trier si besoin (pas strictement nécessaire si timestamps toujours croissants)
    mergedMidiEvents.sort((a, b) => a.timestamp - b.timestamp);

    const mergedLayer = {
      videoUrl,
      midiEvents: mergedMidiEvents,
      startTime: 0 // on remet à zéro puisque c’est notre “nouvelle” couche unique
    };

    // 4) On remplace toutes les couches par cette seule couche fusionnée
    setLoopLayers([mergedLayer]);

    // 5) Persistance (IndexedDB + localStorage) si tu veux garder la video / midi
    localStorage.setItem(
      "mirrorFugueLoopLayers",
      JSON.stringify([{ videoUrl: "loop_0", midiEvents: mergedMidiEvents }])
    );
    await saveLoopToIndexedDB("loop_0", blob);

    // 6) On relance la lecture de cette couche unique
    startLoopPlayback([mergedLayer]);
  };

  // 7) On lance l’enregistrement
  recorder.start();
  loopRecorderRef.current = recorder;

  // 8) On passe en mode record
  setIsLooping(true);
  isLoopingRef.current = true;
};

// Fonction pour arrêter l’enregistrement de loop
const stopLoopRecord = () => {
  console.log("Arrêt de l’enregistrement loop");
  
  // Arrêter le MediaRecorder
  if (loopRecorderRef.current) {
    loopRecorderRef.current.stop();
    loopRecorderRef.current = null;
  }
  
  // Mettre à jour les états
  setIsLooping(false);
  isLoopingRef.current = false;
};

// Fonction dédiée pour sauvegarder une loop sur Firebase
const handleSaveLoop = async () => {
  if (!isLoopPlaying || loopLayers.length === 0 || !currentLearnerName) {
    return;
  }
  
  try {
    // 1. Récupérer la vidéo actuelle de loop (dernière couche)
    const layerId = `loop_${loopLayers.length - 1}`;
    const videoBlob = await getLoopFromIndexedDB(layerId);
    
    if (!videoBlob) {
      return;
    }
    
    // 2. Convertir le blob en base64 sans le préfixe "data:..."
    const reader = new FileReader();
    reader.readAsDataURL(videoBlob);
    
    reader.onloadend = async () => {
      try {
        const base64data = reader.result as string;
        // CORRECTION: S’assurer que le format est correct pour Firebase
        // Supprimer le préfixe data:video/webm;base64, pour avoir uniquement la partie base64
        const base64Clean = base64data.split(',')[1];
        
        // 3. Créer un nom de fichier avec l’indication "loop"
        const dateObj = new Date();
        const day = String(dateObj.getDate()).padStart(2, "0");
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const year = dateObj.getFullYear();
        const hh = String(dateObj.getHours()).padStart(2, "0");
        const mm = String(dateObj.getMinutes()).padStart(2, "0");
        const ss = String(dateObj.getSeconds()).padStart(2, "0");
        const dateString = `${day}-${month}-${year}_${hh}h${mm}m${ss}`;
        const learnerName = currentLearnerName;
        const songName = selectedSound?.title || "UnknownSong";
        // Ajouter "LOOP" dans le nom du fichier
        const fileName = `${dateString}_${learnerName}_${songName}_LOOP.webm`;
        
        // 4. Upload vers Firebase
        const videoUrl = await uploadVideo(fileName, base64Clean);
        
        // 5. Upload des données MIDI
        let midiUrl = "";
        if (loopLayers[0].midiEvents.length > 0) {
          midiUrl = await uploadMidiData(fileName.replace(".webm", ".json"), loopLayers[0].midiEvents);
        }
        
        // 6. Ajouter à la collection du learner
        const recordingData = { name: fileName, videoUrl, midiUrl };
        await addRecordingToLearner(learnerName, recordingData);
        
        // 7. Mise à jour des états locaux
        const newVideo: RecordedVideo = { name: fileName, blobUrl: videoUrl, midiUrl };
        setRecordedVideos(prev => [...prev, newVideo]);
        
        // 8. Mise à jour du contexte
        const currentLearner = learners.find(l => l.name === currentLearnerName);
        if (currentLearner) {
          const updatedLearner = {
            ...currentLearner,
            recordings: [...(currentLearner.recordings || []), recordingData]
          };
          await updateLearner(updatedLearner);
        }
        
      } catch (error) {
        console.error("Erreur lors de l’enregistrement de la loop:", error);
      }
    };
  } catch (error) {
    console.error("Erreur lors de la préparation de la loop:", error);
  }
};

// Fonction pour démarrer la lecture MIDI d’une loop
const startLoopMidiPlayback = () => {
  if (!loopLayers.length || !midiOutputRef.current) return;
  
  // S’assurer qu’il n’y a pas de notes bloquées
  midiOutputRef.current.send([0xB0, 123, 0]); // All Notes Off
  midiOutputRef.current.send([0xB0, 121, 0]); // Reset All Controllers
  
  // Récupérer les événements MIDI de la couche active
  const midiEvents = loopLayers[0].midiEvents;
  
  // Jouer tous les événements avec le bon timing
  midiEvents.forEach(event => {
    setTimeout(() => {
      if (midiOutputRef.current && isLoopPlaying) {
        try {
          midiOutputRef.current.send(event.data);
        } catch (err) {
          console.error("Erreur lors de l’envoi MIDI:", err);
        }
      }
    }, event.timestamp);
  });
  
  console.log(`${midiEvents.length} événements MIDI programmés pour la lecture`);
};

// ------------------------------------------------------------------
// Fonction utilitaire pour rejouer le MIDI d’un enregistrement
const playRecordedMidi = () => {
  if (!selectedRecordedVideo?.midiUrl || !midiOutputRef.current) return;
  const proxied = getProxiedUrl(selectedRecordedVideo.midiUrl);
  fetch(proxied)
    .then(res => res.json())
    .then((midiData: MidiEvent[]) => {
      midiData.forEach(event => {
        setTimeout(() => {
          midiOutputRef.current?.send(event.data);
        }, event.timestamp);
      });
    })
    .catch(err => console.error("Impossible de charger le JSON MIDI:", err));
};
// ------------------------------------------------------------------


  // État pour stocker les points de perspective pour le second écran
  const [secondScreenPerspectivePoints, setSecondScreenPerspectivePoints] = useState<Points | null>(null);
  
  // Référence pour le conteneur du second écran
  const secondScreenContainerRef = useRef<HTMLDivElement | null>(null);

  // Configurer l'écouteur pour les changements de perspective depuis la fenêtre secondaire
  useEffect(() => {
    // Configurer l'écouteur d'événements pour les changements de points
    const cleanup = setupPerspectiveChangeListener((points) => {
      console.log("Points updated from second screen:", points);
      
      // Mettre à jour les points locaux
      setRecordedVideoPerspectivePoints(points as Points);
      
      // Sauvegarder dans Firebase si autorisé
      if (shouldSaveToFirebase() && currentLearnerName && soundId) {
        savePositionConfig(
          currentLearnerName,
          soundId,
          {
            position: recordedVideoContainerPos,
            perspectivePoints: points as Points
          }
        ).then(() => console.log("Position config saved to Firebase"))
          .catch(err => console.error("Failed to save position config:", err));
      }
    });
    
    // Nettoyer l'écouteur à la destruction du composant
    return cleanup;
  }, [currentLearnerName, soundId, recordedVideoContainerPos]);

  // Fonction pour envoyer une vidéo au second écran avec la transformation de perspective
  const sendVideoWithPerspective = (videoElement: HTMLVideoElement | null) => {
    if (!videoElement || !absoluteCrop || !absoluteVideoOffset) return;
    
    sendVideoToSecondScreen(videoElement, {
      crop: absoluteCrop,
      perspectivePoints: recordedVideoPerspectivePoints || {
        topLeft: { x: 0, y: 0 },
        topRight: { x: absoluteCrop.width, y: 0 },
        bottomRight: { x: absoluteCrop.width, y: absoluteCrop.height },
        bottomLeft: { x: 0, y: absoluteCrop.height }
      },
      videoOffset: absoluteVideoOffset,
      baseWidth: 640,
      baseHeight: (absoluteCrop.height / absoluteCrop.width) * 640,
      editable // Passer l'état editable pour afficher les points sur le second écran
    });
  };

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      Chargement...
    </div>;
  }

  return (
    <div style={{ padding: "1rem", fontFamily: "Arial, sans-serif", width: "100%" }}>
      {/* ─── Contrôle du delay vidéo ────────────────────────────────── */}
      <div style={{
        position: "fixed",
        top: "1rem",
        right: "1rem",
        background: "rgba(0,0,0,0.5)",
        padding: "0.5rem 0.75rem",
        borderRadius: "4px",
        zIndex: 2000,
        color: "#fff",
        fontSize: "0.85rem"
      }}>
        <label>
          Delay vidéo (ms):
          <input
            type="number"
            value={videoDelayMs}
            onChange={e => setVideoDelayMs(Number(e.target.value))}
            style={{
              width: "60px",
              marginLeft: "0.5rem",
              fontSize: "0.85rem",
              padding: "2px 4px",
              borderRadius: "2px",
              border: "1px solid #ccc"
            }}
          />
        </label>
      </div>
      {/* ──────────────────────────────────────────────────────────────── */}

      {overlayMessage && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#800080",
            fontSize: "2rem",
            fontFamily: "Georgia, serif",
            textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          {overlayMessage}
        </div>
      )}
      {showPerformancePlayback && performanceVideoURL && (
        <Rnd position={recordedVideoContainerPos} onDragStop={(e, d) => setRecordedVideoContainerPos({ x: d.x, y: d.y })}>
          <div
            id="recordedVideoContainer"
            style={{
              width: absoluteCrop?.width || 640,
              height: absoluteCrop?.height || 360,
              position: "relative",
              overflow: "visible",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: absoluteCrop?.x || 0,
                top: absoluteCrop?.y || 0,
                width: absoluteCrop?.width || 640,
                height: absoluteCrop?.height || 360,
                overflow: "visible",
              }}
            >
              <PerspectiveTransform
                points={recordedVideoPerspectivePoints || { 
                  topLeft: { x: 0, y: 0 }, 
                  topRight: { x: 640, y: 0 }, 
                  bottomRight: { x: 640, y: 360 }, 
                  bottomLeft: { x: 0, y: 360 } 
                }}
                editable={false}
              >
                {isLocalVideo ? (
                  <video
                    ref={performanceVideoRef}
                    src={performanceVideoURL}
                    autoPlay={false} // Changer à false pour contrôler manuellement le démarrage
                    playsInline
                    style={{
                      position: "absolute",
                      left: absoluteVideoOffset ? -absoluteVideoOffset.x : 0,
                      top: absoluteVideoOffset ? -absoluteVideoOffset.y : 0,
                      width: "640px",
                      height: "auto",
                    }}
                    onLoadedData={() => {
                      if (performanceVideoRef.current) sendVideoWithPerspective(performanceVideoRef.current);
                      // S’assurer que le délai VIDEO_DELAY_MS est respecté
                      setTimeout(() => {
                        if (performanceVideoRef.current) performanceVideoRef.current.play().catch(err => 
                          console.error("Erreur lors de la lecture de la vidéo locale:", err)
                        );
                      }, videoDelayMs); // Utiliser la constante VIDEO_DELAY_MS
                    }}
                    onEnded={() => {
                      clearSecondScreen();
                      setShowPerformancePlayback(false);
                    }}
                  />
                ) : null}
              </PerspectiveTransform>
            </div>
          </div>
        </Rnd>
      )}
      {/* Barre supérieure */}
      <div style={{ position: "relative", marginBottom: "1rem" }}>
        <div style={{ position: "absolute", left: 0, top: 0, display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link href="/learner/select-sound">
            <button style={{ backgroundColor: "#0070f3", color: "#fff", padding: "0.5rem 1rem", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "0.8rem" }}>
              Back
            </button>
          </Link>
          {currentLearnerName === "Polpii" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <IOSSwitch checked={saveToFirebase} onChange={() => setSaveToFirebase(!saveToFirebase)} />
              <span style={{ fontSize: "0.8rem" }}>Save to Firebase</span>
            </div>
          )}
        </div>
        <h4 style={{ textAlign: "center", fontSize: "1.5rem", margin: 0, marginBottom: "4rem" }}>{selectedSound?.title}</h4>
      </div>
      {/* Timeline MIDI */}
      {selectedSound?.midiUrl && selectedSound.sections && (
        <div style={{ marginBottom: "1rem" }}>
          <AudioTimelineReadOnly
            midiUrl={selectedSound.midiUrl}
            totalTime={totalTime}
            containerHeight={100}
            sections={selectedSound.sections}
            onPlaySection={(section) => handlePlaySection(section)}
            currentTime={currentTime}
            noteColors={currentEvaluation}
          />
        </div>
      )}
      {/* Barre de contrôles */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "1rem", marginTop: "2rem", marginBottom: "0rem" }}>
      {currentLearnerName === "Polpii" && (
        <>
          <button
            onClick={handleSavePosition}
            style={{
              backgroundColor: "#6c757d",
              color: "#fff",
              padding: "0.25rem 0.5rem",
              borderRadius: "4px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.5rem",
            }}
          >
            Save Position
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <IOSSwitch checked={editable} onChange={() => setEditable(!editable)} />
            <span style={{ fontSize: "0.5rem" }}>Edit Transform</span>
          </div>
        </>
      )}

        {/* Le bouton Save (💾) reste inchangé pour sauvegarder vers Firebase */}
        {performanceVideoURL && !isPerformanceRecording ? (
          <button
            onClick={handleSavePerformance}
            style={{ backgroundColor: "#0070f3", color: "#fff", padding: "0.5rem 1rem", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "1.2rem" }}
          >
            💾
          </button>
        ) : null}
        {/* Bouton fleche tournante modifié : il charge le fichier performance depuis le local storage */}
        {performanceVideoURL && !isPerformanceRecording ? (
          <button
            onClick={handleListenPreviousButton}
            style={{ backgroundColor: "#0070f3", color: "#fff", padding: "0.5rem 1rem", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "1.2rem" }}
          >
            ⟲
          </button>
        ) : null}
        <button onClick={handleStop} style={{ backgroundColor: "#dc3545", color: "#fff", padding: "0.5rem 1rem", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "1.2rem" }}>
          ◼
        </button>
        <button onClick={handleRecordButton} style={{ backgroundColor: "#dc3545", color: "#fff", padding: "0.5rem 1rem", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "1.2rem", animation: isRecording ? "blinkRecord 0.7s infinite" : "none" }}>
          ⬤
        </button>
        <div style={{ display: "flex", alignItems: "center",fontSize: "0.5rem", gap: "0.3rem" }}>
          <span>Speed:</span>
          <input type="range" min="0.10" max="2" step="0.1" value={playbackSpeed} onChange={(e) => {
            const newSpeed = parseFloat(e.target.value);
            setPlaybackSpeed(newSpeed);
            // Suivi analytique du changement de vitesse
            trackEvent(TrainingEventTypes.PLAYBACK_SPEED_CHANGE, { oldSpeed: playbackSpeed, newSpeed });
          }} list="tickmarks" style={{ cursor: "pointer" }} />
          <datalist id="tickmarks">
            <option value="1" label="1"></option>
          </datalist>
          <span>{playbackSpeed.toFixed(1)}x</span>
        </div>
        {recordedVideos.length > 0 && (
          <div style={{ position: "relative", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>Recorded:</span>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.8rem", cursor: "pointer", width: "150px", whiteSpace: "nowrap" }}
            >
              {selectedRecordedName ? formatDisplay(selectedRecordedName) : "-- Select --"}
            </button>
            {dropdownOpen && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                backgroundColor: "#fff",
                border: "1px solid #ccc",
                borderRadius: "4px",
                zIndex: 100,
                width: "100%"
              }}>
                {recordedVideos.map(rv => (
                  <div key={rv.name} 
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "4px 8px",
                      cursor: "pointer",
                      borderBottom: "1px solid #eee",
                      whiteSpace: "nowrap"
                    }}
                    onClick={() => { setSelectedRecordedName(rv.name); setDropdownOpen(false); }}
                  >
                    <span onClick={(e) => { e.stopPropagation(); handleDeleteRecording(rv.name); }} style={{ cursor: "pointer", color: "red", marginRight: "4px" }}>x</span>
                    <span>{formatDisplay(rv.name)}</span>
                    <span 
                      onClick={(e) => { e.stopPropagation(); openNoteModal(rv.name); }} 
                      style={{ cursor: "pointer", fontSize: "16px" }}
                    >
                      📒
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Nouveaux boutons du Looper avec un style distinctif */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "0.2rem", 
          backgroundColor: "#e0f7fa", 
          padding: "0.2rem 0.4rem", 
          borderRadius: "6px",
          border: "1px solid #4dd0e1"
        }}>
          <span style={{ fontSize: "0.7rem", fontWeight: "bold", color: "#00838f" }}>LOOPER:</span>
          <button 
            onClick={handleLoopRecording} 
            style={{ 
              backgroundColor: isLooping ? "#ff5722" : "#009688", 
              color: "#fff", 
              padding: "0.2rem 0.5rem", 
              borderRadius: "4px", 
              border: "none", 
              cursor: "pointer", 
              fontSize: "0.8rem",
              animation: isLooping ? "blinkRecord 0.7s infinite" : "none"
            }}
          >
            {isLooping ? "⏹ STOP" : "🔴 REC"}
          </button>
          <button 
            onClick={handleLoopPlayback}
            disabled={loopLayers.length === 0} 
            style={{ 
              backgroundColor: isLoopPlaying ? "#ff9800" : "#4caf50", 
              color: "#fff", 
              padding: "0.2rem 0.5rem", 
              borderRadius: "4px", 
              border: "none", 
              cursor: loopLayers.length > 0 ? "pointer" : "not-allowed", 
              fontSize: "0.8rem",
              opacity: loopLayers.length > 0 ? 1 : 0.5,
            }}
          >
            {isLoopPlaying ? "⏸ PAUSE" : "▶ PLAY"}
          </button>
          <button 
            onClick={handleRemoveLastLayer}
            disabled={loopLayers.length === 0} 
            style={{ 
              backgroundColor: "#f44336", 
              color: "#fff", 
              padding: "0.2rem 0.5rem", 
              borderRadius: "4px", 
              border: "none", 
              cursor: loopLayers.length > 0 ? "pointer" : "not-allowed", 
              fontSize: "0.8rem",
              opacity: loopLayers.length > 0 ? 1 : 0.5,
            }}
          >
            🗑 LAYER
          </button>
          <button 
            onClick={handleSaveLoop}
            disabled={loopLayers.length === 0} 
            style={{ 
              backgroundColor: "#3f51b5", 
              color: "#fff", 
              padding: "0.2rem 0.5rem", 
              borderRadius: "4px", 
              border: "none", 
              cursor: loopLayers.length > 0 ? "pointer" : "not-allowed", 
              fontSize: "0.8rem",
              opacity: loopLayers.length > 0 ? 1 : 0.5,
            }}
          >
            💾 SAVE
          </button>
        </div>
      </div>
      
      {/* Modal pour la saisie des notes */}
      {noteModalOpen && (
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          backgroundColor: "#fff", border: "1px solid #ccc", borderRadius: "8px", padding: "1rem", zIndex: 2000
        }}>
          <h4>Recording Note</h4>
          <textarea 
            value={currentRecordingNote}
            onChange={(e) => setCurrentRecordingNote(e.target.value)}
            rows={4}
            cols={30}
            style={{ width: "100%" }}
          />
          <div style={{ marginTop: "0.5rem", textAlign: "right" }}>
            <button onClick={() => setNoteModalOpen(false)} style={{ marginRight: "0.5rem" }}>Cancel</button>
            <button onClick={saveRecordingNote}>Save</button>
          </div>
        </div>
      )}
      
      {/* Conteneur pour la vidéo de performance playback */}
      {showPerformancePlayback && performanceVideoURL && calibrationConfig && absoluteCrop && absolutePoints && absoluteVideoOffset ? (
        <Rnd position={recordedVideoContainerPos} onDragStop={(e, d) => setRecordedVideoContainerPos({ x: d.x, y: d.y })}>
          <div
            id="recordedVideoContainer"
            style={{
              width: absoluteCrop.width,
              height: absoluteCrop.height,
              position: "relative",
              overflow: "visible",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: absoluteCrop.x,
                top: absoluteCrop.y,
                width: absoluteCrop.width,
                height: absoluteCrop.height,
                overflow: "visible",
              }}
            >
              <PerspectiveTransform
                points={recordedVideoPerspectivePoints || { topLeft: { x: 0, y: 0 }, topRight: { x: 640, y: 0 }, bottomRight: { x: 640, y: 360 }, bottomLeft: { x: 0, y: 360 } }}
                editable={false}
              >
                {/* IMPORTANT: Utiliser deux éléments vidéo différents selon le mode (looper ou lecture unique) */}
                {isLocalVideo ? (
                  isLoopPlaying ? (
                    // Vidéo du looper — avec boucle
                    <video
                      ref={el => {
                        loopVideoRef.current = el
                        performanceVideoRef.current = el
                      }}
                      src={performanceVideoURL!}
                      playsInline
                      style={{
                        position: "absolute",
                        left: -absoluteVideoOffset.x,
                        top: -absoluteVideoOffset.y,
                        width: "640px",
                        height: "auto",
                      }}
                      onLoadedData={() => {
                        const el = loopVideoRef.current;
                        if (el) sendVideoWithPerspective(el);
                        // Démarre vidéo + MIDI en une fois, sans délai
                        loopVideoRef.current?.play().catch(console.error)
                        startLoopMidiPlayback()
                      }}
                      onEnded={() => {
                        clearSecondScreen();
                        // Quand la vidéo s’arrête, couper le piano
                        if (!isLoopPlaying) {
                          midiOutputRef.current?.send([0xB0,123,0])
                          midiOutputRef.current?.send([0xB0,121,0])
                          return
                        }
                        // Si on est toujours en mode loop, relance vidéo+MIDI en synchro
                        loopVideoRef.current!.currentTime = 0
                        loopVideoRef.current!.play().catch(console.error)
                        startLoopMidiPlayback()
                      }}
                    />
                  ) : (
                    // Vidéo pour la lecture unique (bouton ⟲)
                    <video
                      ref={performanceVideoRef}
                      src={performanceVideoURL!}
                      playsInline
                      style={{
                        position: "absolute",
                        left: -absoluteVideoOffset.x,
                        top: -absoluteVideoOffset.y,
                        width: "640px",
                        height: "auto",
                      }}
                      onLoadedData={() => {
                        if (performanceVideoRef.current) sendVideoWithPerspective(performanceVideoRef.current);
                        setTimeout(() => {
                          performanceVideoRef.current?.play().catch(err =>
                            console.error("Erreur lors de la lecture de la vidéo locale:", err)
                          );
                        }, videoDelayMs);
                      }}
                      onEnded={() => {
                        clearSecondScreen();
                        if (!isLoopPlaying) {
                          setShowPerformancePlayback(false);
                        }
                      }}
                    />
                  )
                ) : (
                  // Pour les vidéos non-locales (URLs distantes)
                  <ContentMedia
                    ref={performanceVideoRef}
                    path={performanceVideoURL}
                    type="video"
                    onLoadedData={() => {
                      if (performanceVideoRef.current) sendVideoWithPerspective(performanceVideoRef.current);
                      setTimeout(() => {
                        performanceVideoRef.current?.play();
                      }, videoDelayMs);
                    }}
                    onEnded={() => {
                      clearSecondScreen();
                      setShowPerformancePlayback(false);
                    }}
                    style={{
                      position: "absolute",
                      left: -absoluteVideoOffset.x,
                      top: -absoluteVideoOffset.y,
                      width: "640px",
                      height: "auto",
                    }}
                  />
                )}
              </PerspectiveTransform>
            </div>
          </div>
        </Rnd>
      ) : null}
      {/* Conteneur pour la vidéo par défaut (vidéo enregistrée depuis la liste déroulante) */}
      {!videoLoading && (
        <div
          id="defaultVideoContainer"
          style={{
            margin: "0 auto",
            width: "100%",
            maxWidth: "1200px",
            overflow: "visible",
            display: "block", // Toujours présent dans le DOM
            visibility: mainVideoReady ? "visible" : "hidden",
            position: "relative", 
            zIndex: 1, // Z-index inférieur pour rester sous les autres vidéos
            opacity: selectedRecordedName || showPerformancePlayback ? 0 : 1, // Transparent quand d’autres vidéos sont actives
            transition: "opacity 0.3s ease" // Transition douce
          }}
        >
          <PerspectiveTransform
            storageKey={`calibration-${soundId}`}
            editable={editable}
            toggleKeys={["v"]}
            enableGroupDrag
            onPointsChange={(newPoints: Points) => {
              handleCalibrationPointsChange(newPoints);
            }}
          >
            <ContentMedia
              ref={videoRef}
              path={selectedSound?.videoUrl || ""}
              type="video"
              onLoadedData={() => {
                if (videoRef.current) sendVideoWithPerspective(videoRef.current);
              }}
              playsInline
              onTimeUpdate={(e: React.SyntheticEvent<HTMLVideoElement>) => setCurrentTime(e.currentTarget.currentTime)}
              style={{ width: "100%", height: "auto" }}
            />
          </PerspectiveTransform>
        </div>
      )}
      {/* Conteneur pour les vidéos enregistrées du profil (sélectionnées dans la liste déroulante) */}
      {selectedRecordedName && (
        <Rnd position={recordedVideoContainerPos} onDragStop={(e, d) => setRecordedVideoContainerPos({ x: d.x, y: d.y })}>
          <div
            id="recordedVideoContainer"
            style={{
              width: absoluteCrop ? absoluteCrop.width : 640,
              height: absoluteCrop ? absoluteCrop.height : 360,
              position: "relative",
              overflow: "visible",
              zIndex: 2, // Higher z-index to appear on top of the default video
              visibility: showPerformancePlayback ? "hidden" : "visible" // Hide when performance video is active, but keep in DOM
            }}
          >
            <div
              style={{
                position: "absolute",
                left: absoluteCrop ? absoluteCrop.x : 0,
                top: absoluteCrop ? absoluteCrop.y : 0,
                width: absoluteCrop ? absoluteCrop.width : 640,
                height: absoluteCrop ? absoluteCrop.height : 360,
                overflow: "visible",
              }}
            >
              <PerspectiveTransform
                // Utilise les points sauvegardés si existants ou un défaut
                points={recordedVideoPerspectivePoints || { topLeft: { x: 0, y: 0 }, topRight: { x: 640, y: 0 }, bottomRight: { x: 640, y: 360 }, bottomLeft: { x: 0, y: 360 } }}
                editable={editable}
                toggleKeys={["v"]}
                enableGroupDrag
                // Met à jour les points lors d’un changement
                onPointsChange={(newPoints: Points) => setRecordedVideoPerspectivePoints(newPoints)}
              >
                {/* ─── Vidéo enregistrée — boucle si "_LOOP" ──────────────────── */}
                {(() => {
                  const isLoop = selectedRecordedName.toLowerCase().endsWith("_loop.webm");
                  return (
                    <video
                      ref={recordedVideoRef}
                      src={selectedRecordedVideo?.blobUrl}
                      controls
                      style={{
                        position: "absolute",
                        left: absoluteVideoOffset ? -absoluteVideoOffset.x : 0,
                        top: absoluteVideoOffset ? -absoluteVideoOffset.y : 0,
                        width: "640px",
                        height: "auto",
                      }}
                      onLoadedData={() => {
                        if (recordedVideoRef.current) sendVideoWithPerspective(recordedVideoRef.current);
                        setTimeout(() => {
                          recordedVideoRef.current?.play();
                          if (isLoop) playRecordedMidi();
                        }, videoDelayMs);
                      }}
                      onEnded={() => {
                        clearSecondScreen();
                        if (isLoop) {
                          // remet au début et reboucle
                          recordedVideoRef.current!.currentTime = 0;
                          recordedVideoRef.current!.play();
                          playRecordedMidi();
                        } else {
                          // comportement par défaut
                          setSelectedRecordedName("");
                        }
                      }}
                    />
                  );
                })()}
                {/* ──────────────────────────────────────────────────────────────── */}

              </PerspectiveTransform>
            </div>
          </div>
        </Rnd>
      )}
      <style jsx>{`
        @keyframes blinkRecord {
          0% { background-color: #dc3545; }
          100% { background-color: rgb(167, 24, 38); }
        }
        datalist#tickmarks option { font-size: 2rem !important; }
      `}</style>
    </div>
  );
}