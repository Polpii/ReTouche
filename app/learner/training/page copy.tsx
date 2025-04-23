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

// Délai (en ms) pour synchroniser la vidéo avec le MIDI
const VIDEO_DELAY_MS = 350;

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

  const { currentLearnerName, learners, updateLearner } = useLearnerContext();
  const { sounds, updateSound } = useSoundContext();

  // Loading state
  const [loading, setLoading] = useState(true);
  const [mainVideoReady, setMainVideoReady] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!currentLearnerName) router.push("/learner/profile");
    if (!soundId) router.push("/learner/select-sound");
  }, [currentLearnerName, soundId, router]);

  const selectedSound = sounds.find((s) => s.id === soundId);
  useEffect(() => {
    if (!selectedSound) router.push("/learner/select-sound");
  }, [selectedSound, router]);

  // États de contrôle
  const [editable, setEditable] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Vidéos enregistrées du profil (enregistrées via le bouton blanc)
  const [recordedVideos, setRecordedVideos] = useState<RecordedVideo[]>([]);
  const [selectedRecordedName, setSelectedRecordedName] = useState<string>("");

  // Nouvel état pour le dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
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

  // États pour l'overlay et le performance recording (temporaire)
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);
  const [isPerformanceRecording, setIsPerformanceRecording] = useState(false);
  const [performanceVideoURL, setPerformanceVideoURL] = useState<string | null>(null);
  const [showPerformancePlayback, setShowPerformancePlayback] = useState(false);
  // Références pour les événements MIDI de performance
  const performanceMIDIEventsRef = useRef<any[]>([]);
  const lastPerformanceEventRef = useRef<number>(0);
  const performanceStreamRef = useRef<MediaStream | null>(null);
  const performanceStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const performanceRecordStartRef = useRef<number>(0);
  const performanceRecorderRef = useRef<MediaRecorder | null>(null);

  // Références pour la lecture des vidéos enregistrées (dropdown et performance playback)
  const recordedVideoRef = useRef<HTMLVideoElement | null>(null);
  const performanceVideoRef = useRef<HTMLVideoElement | null>(null);

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

  // Références pour l'enregistrement MIDI général (lancé par le bouton blanc)
  const midiEventsRef = useRef<any[]>([]);
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

  // Initialisation globale du port MIDI d'entrée
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
          console.warn("Port MIDI d'entrée non trouvé pour Disklavier, utilisation du port :", input.name);
        }
        if (input) {
          midiInputRef.current = input as unknown as MIDIInput;
          // Handler par défaut (inactif)
          input.onmidimessage = (event) => {
            // Pas d'action par défaut
          };
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

  // Ajout d'un ref pour suivre les timeouts programmés
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
    }, VIDEO_DELAY_MS);
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

  // Lorsqu'une vignette est cliquée, on lance la lecture de la section.
  // À la fin, l'overlay passe à "Your turn now" et le performance recording démarre.
  const handlePlaySection = (section: Section) => {
    if (!selectedSound) return;
    setCurrentSectionIndex(selectedSound.sections.indexOf(section));
    setOverlayMessage("Pay attention");
    if (videoRef.current) videoRef.current.currentTime = section.start;
    playSection(section);
    playMidiSection(section);
    const sectionDurationMs = ((section.end - section.start) * 1000) / playbackSpeed;
    scheduleTimeout(() => {
      setOverlayMessage("Your turn now");
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

// 1. D'abord, ajoutons un nouvel état pour indiquer si nous utilisons une vidéo locale ou distante
const [isLocalVideo, setIsLocalVideo] = useState(false);

// 2. Modifions handleListenPreviousButton pour définir cet état
const handleListenPreviousButton = () => {
  try {
    // Obtenir les données MIDI
    const storedMIDI = localStorage.getItem("localPerformanceMIDI");
    // Obtenir l'URL de la vidéo
    const storedVideoURL = localStorage.getItem("localPerformanceVideoURL");
    
    if (storedMIDI && storedVideoURL) {
      const recordingData = JSON.parse(storedMIDI);
      
      // Configurer les événements MIDI
      performanceMIDIEventsRef.current = recordingData.midi || [];
      
      // IMPORTANT: Vérifier si l'URL est un blob: ou un data:
      if (storedVideoURL.startsWith('blob:') || storedVideoURL.startsWith('data:')) {
        // Si c'est une URL locale, utiliser directement l'URL sans passer par ContentMedia
        setPerformanceVideoURL(storedVideoURL);
        setIsLocalVideo(true);
        
        // Afficher la vidéo
        setShowPerformancePlayback(true);
        
        // Planifier la lecture des événements MIDI
        if (performanceMIDIEventsRef.current.length > 0 && midiOutputRef.current) {
          performanceMIDIEventsRef.current.forEach((event) => {
            scheduleTimeout(() => {
              midiOutputRef.current?.send(event.data);
            }, event.timestamp);
          });
        }
      } else {
        console.error("L'URL n'est pas une URL locale valide");
        alert("Format de vidéo non pris en charge");
      }
    } else {
      console.log("Aucune performance trouvée dans le stockage local");
      alert("Aucune performance sauvegardée");
    }
  } catch (error) {
    console.error("Erreur lors du chargement depuis le stockage local:", error);
    alert("Erreur lors du chargement de la performance");
  }
};

  // Enregistrement général (bouton avec la boule blanche) - inchangé (upload sur Firebase)
  const handleRecordButton = async () => {
    if (!isRecording) {
      try {
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
              
              // Add recording to learner's profile
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
              console.warn("Port MIDI d'entrée non trouvé pour Disklavier, utilisation du port :", input.name);
            }
            if (input) {
              midiInputRef.current = input as unknown as MIDIInput;
              input.onmidimessage = (event) => {
                const timestamp = performance.now() - recordStartTimeRef.current;
                midiEventsRef.current.push({
                  data: event.data ? Array.from(event.data) : [],
                  timestamp,
                });
              };
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
        midiInputRef.current.onmidimessage = null;
      }
      console.log("Recording stopped.");
    }
  };

  // Enregistrement de performance (déclenché automatiquement après la section)
  // Le recording se lance quand "Your turn now" est affiché et se termine lorsque
  // le temps minimum de la section est écoulé ET qu'aucune touche (note on) n'est pressée pendant 2 secondes.
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
          // Arrêter le recording si le temps minimum de la section est écoulé ET aucune touche (note on) n'a été pressée pendant 2 sec.
          if (now - performanceRecordStartRef.current >= sectionDurationMs && now - lastPerformanceEventRef.current >= 2000) {
            stopPerformanceRecording();
          } else {
            performanceStopTimeoutRef.current = setTimeout(checkInactivity, 100);
          }
        };
        performanceStopTimeoutRef.current = setTimeout(checkInactivity, 100);
      })
      .catch((err) => console.error("Erreur lors de l'obtention du stream pour la performance", err));
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
      // Sauvegarder l'évaluation pour la section jouée
      newEvaluations[selectedSound.id][currentSectionIndex] = colors;
      const updatedLearner = { ...currentLearner, evaluations: newEvaluations };
      updateLearner(updatedLearner);
    }
  }
  
  // Réinitialiser les handlers MIDI
  if (midiInputRef.current) {
    midiInputRef.current.onmidimessage = (event) => {
      const timestamp = performance.now() - recordStartTimeRef.current;
      midiEventsRef.current.push({
        data: event.data ? Array.from(event.data) : [],
        timestamp,
      });
    };
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
        setMainVideoReady(false); // Réinitialiser l'état de préparation
        const config = await getCalibrationConfig("calibration-recorded");
        setCalibrationConfig(config);
        // Ne pas mettre à true ici, cela sera fait par l'élément vidéo lui-même
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
          
          // Créer un URL d'objet et le stocker
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
      alert("Impossible de sauvegarder: l'apprenant ou le morceau n'est pas sélectionné");
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
      alert("Position sauvegardée !");
    } catch (err) {
      console.error("Erreur lors de la sauvegarde de la position :", err);
      
      // Fallback to localStorage
      try {
        localStorage.setItem("recordedVideoContainerPos", JSON.stringify(recordedVideoContainerPos));
        localStorage.setItem("recordedVideoPerspectivePoints", JSON.stringify(recordedVideoPerspectivePoints));
        alert("Position sauvegardée localement (échec Firebase)");
      } catch (localErr) {
        console.error("Erreur lors de la sauvegarde locale:", localErr);
        alert("Erreur lors de la sauvegarde de la position");
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
            midiData.forEach((event: any) => {
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
      // Mise à jour de l'enregistrement pour y ajouter la note
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
      alert("Impossible de supprimer l'enregistrement");
    }
  };

  // Transformation du bouton pause en bouton stop
  const handleStop = () => {
    // Annuler tous les timeouts en attente
    scheduledTimeouts.current.forEach((timeout) => clearTimeout(timeout));
    scheduledTimeouts.current = [];
    // Masquer immédiatement l'overlay
    setOverlayMessage(null);
    // Arrêter la vidéo principale et celle enregistrée
    if (videoRef.current) {
      videoRef.current.pause();
    }
    if (recordedVideoRef.current) {
      recordedVideoRef.current.pause();
    }
    // Envoyer "all notes off" via MIDI pour stopper le piano
    if (midiOutputRef.current) {
      midiOutputRef.current.send([0xB0, 64, 0]);
      midiOutputRef.current.send([0xB0, 123, 0]);
    }
    // Arrêter l'enregistrement général s'il est en cours
    if (isRecording && mediaRecorder) {
      mediaRecorder.stop();
      recordStream?.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setMediaRecorder(null);
      setRecordStream(null);
    }
    // Arrêter le performance recording s'il est en cours
    if (isPerformanceRecording && performanceRecorderRef.current) {
      performanceRecorderRef.current.stop();
      performanceStreamRef.current?.getTracks().forEach((track) => track.stop());
      setIsPerformanceRecording(false);
    }
    // Masquer la vidéo enregistrée et réafficher la vidéo de base
    setShowPerformancePlayback(false);
    setSelectedRecordedName("");
  };

  // Ajout de la fonction handleSavePerformance - inchangée (upload sur Firebase)
  const handleSavePerformance = async () => {
    if (!performanceVideoURL || !currentLearnerName) return;
    
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
      // Upload video to Firebase Storage
      const videoUrl = await uploadVideo(fileName, performanceVideoURL);
      
      // Upload MIDI data to Firebase Storage
      let midiUrl = "";
      if (performanceMIDIEventsRef.current.length > 0) {
        midiUrl = await uploadMidiData(fileName.replace(".webm", ".json"), performanceMIDIEventsRef.current);
      }
      
      // Add recording to learner's profile
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
      console.error("Error saving performance to Firebase:", err);
      alert("Erreur lors de la sauvegarde de la performance");
    }
  };

  // Update the onPointsChange handler to save calibration points to the sound document
  const handleCalibrationPointsChange = (newPoints: Points) => {
    if (selectedSound) {
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

      // Stocker l'élément vidéo pour référence
      videoElRef.current = preloadVideo;
      
      // Marquer que la vidéo est prête à être utilisée
      setVideoLoading(false);
      
      // Après un court délai supplémentaire pour s'assurer que tout est bien calculé
      setTimeout(() => {
        setMainVideoReady(true);
      }, 400);
    };
    
    // Lancer le chargement
    document.body.appendChild(preloadVideo);
    preloadVideo.load();
    
    // Nettoyer l'élément au démontage
    return () => {
      document.body.removeChild(preloadVideo);
    };
  }, [selectedSound?.videoUrl]);

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      Chargement...
    </div>;
  }

  return (
    <div style={{ padding: "1rem", fontFamily: "Arial, sans-serif", width: "100%" }}>
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
                      // S'assurer que le délai VIDEO_DELAY_MS est respecté
                      setTimeout(() => {
                        if (performanceVideoRef.current) {
                          performanceVideoRef.current.play().catch(err => 
                            console.error("Erreur lors de la lecture de la vidéo locale:", err)
                          );
                        }
                      }, VIDEO_DELAY_MS); // Utiliser la constante VIDEO_DELAY_MS
                    }}
                    onEnded={() => setShowPerformancePlayback(false)}
                  />
                ) : null}
              </PerspectiveTransform>
            </div>
          </div>
        </Rnd>
      )}
      {/* Barre supérieure */}
      <div style={{ position: "relative", marginBottom: "1rem" }}>
        <div style={{ position: "absolute", left: 0, top: 0 }}>
          <Link href="/learner/select-sound">
            <button style={{ backgroundColor: "#0070f3", color: "#fff", padding: "0.5rem 1rem", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "1.2rem" }}>
              Back
            </button>
          </Link>
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
              fontSize: "0.8rem",
            }}
          >
            Save Position
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <IOSSwitch checked={editable} onChange={() => setEditable(!editable)} />
            <span style={{ fontSize: "0.9rem" }}>Edit Transform</span>
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>Speed:</span>
          <input type="range" min="0.10" max="2" step="0.1" value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))} list="tickmarks" style={{ cursor: "pointer" }} />
          <datalist id="tickmarks">
            <option value="1" label="1"></option>
          </datalist>
          <span>{playbackSpeed.toFixed(1)}x</span>
        </div>
        {recordedVideos.length > 0 && (
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>Recorded:</span>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.9rem", cursor: "pointer", width: "250px", whiteSpace: "nowrap" }}
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
                // Use the same saved configuration as the recorded video section
                points={recordedVideoPerspectivePoints || { topLeft: { x: 0, y: 0 }, topRight: { x: 640, y: 0 }, bottomRight: { x: 640, y: 360 }, bottomLeft: { x: 0, y: 360 } }}
                editable={false}
              >
                {/* IMPORTANT: Au lieu d'utiliser ContentMedia, on utilise un élément video HTML standard pour les data:URLs */}
                {isLocalVideo ? (
                  <video
                    ref={performanceVideoRef}
                    src={performanceVideoURL}
                    autoPlay={false} // Changer à false pour contrôler manuellement le démarrage
                    playsInline
                    style={{
                      position: "absolute",
                      left: -absoluteVideoOffset.x,
                      top: -absoluteVideoOffset.y,
                      width: "640px",
                      height: "auto",
                    }}
                    onLoadedData={() => {
                      // S'assurer que le délai VIDEO_DELAY_MS est respecté
                      setTimeout(() => {
                        if (performanceVideoRef.current) {
                          performanceVideoRef.current.play().catch(err => 
                            console.error("Erreur lors de la lecture de la vidéo locale:", err)
                          );
                        }
                      }, VIDEO_DELAY_MS); // Utiliser la constante VIDEO_DELAY_MS
                    }}
                    onEnded={() => setShowPerformancePlayback(false)}
                  />
                ) : (
                  <ContentMedia
                    ref={performanceVideoRef}
                    path={performanceVideoURL}
                    type="video"
                    onLoadedData={() => {
                      setTimeout(() => {
                        performanceVideoRef.current?.play();
                      }, VIDEO_DELAY_MS);
                    }}
                    onEnded={() => setShowPerformancePlayback(false)}
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
      {!showPerformancePlayback && !videoLoading && (
        <div
          id="defaultVideoContainer"
          style={{
            margin: "0 auto",
            width: "100%",
            maxWidth: "1200px",
            overflow: "visible",
            display: selectedRecordedName ? "none" : "block",
            visibility: mainVideoReady ? "visible" : "hidden"
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
              playsInline
              onTimeUpdate={(e: React.SyntheticEvent<HTMLVideoElement>) => setCurrentTime(e.currentTarget.currentTime)}
              style={{ width: "100%", height: "auto" }}
            />
          </PerspectiveTransform>
        </div>
      )}
      {/* Conteneur pour les vidéos enregistrées du profil (sélectionnées dans la liste déroulante) */}
      {selectedRecordedName && !showPerformancePlayback && (
        <Rnd position={recordedVideoContainerPos} onDragStop={(e, d) => setRecordedVideoContainerPos({ x: d.x, y: d.y })}>
          <div
            id="recordedVideoContainer"
            style={{
              width: absoluteCrop ? absoluteCrop.width : 640,
              height: absoluteCrop ? absoluteCrop.height : 360,
              position: "relative",
              overflow: "visible",
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
                // Met à jour les points lors d'un changement
                onPointsChange={(newPoints: Points) => setRecordedVideoPerspectivePoints(newPoints)}
              >
                <ContentMedia
                  ref={recordedVideoRef}
                  path={selectedRecordedVideo?.blobUrl || ""}
                  type="video"
                  controls
                  onLoadedData={() => {
                    setTimeout(() => {
                      recordedVideoRef.current?.play();
                    }, VIDEO_DELAY_MS);
                  }}
                  onEnded={() => setSelectedRecordedName("")}
                  style={{
                    position: "absolute",
                    left: absoluteVideoOffset ? -absoluteVideoOffset.x : 0,
                    top: absoluteVideoOffset ? -absoluteVideoOffset.y : 0,
                    width: "640px",
                    height: "auto",
                  }}
                />
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
