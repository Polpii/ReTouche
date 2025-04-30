import { db } from "./firebase";
import { doc, setDoc, getDoc, updateDoc, increment, serverTimestamp, collection } from "firebase/firestore";

// Collection Firestore pour stocker les données d'analyse par apprenant
const ANALYTICS_COLLECTION = "userAnalytics";
const SESSION_TIMEOUT_MS = 1800000; // 30 minutes

// Structure de données pour les événements
interface TrainingEvent {
    type: string;
    value?: any;
    timestamp: number;
}

// Structure pour une session d'entraînement
interface TrainingSession {
    id: string;
    startTime: number;
    date: string;         // Date formatée (jour-mois-année)
    time: string;         // Heure formatée (heure:minute)
    learnerName: string;
    soundId: string;
    soundTitle: string;   // Titre du son travaillé
    events: TrainingEvent[];
    lastActivity: number;
    duration?: number;    // Durée totale en millisecondes
    metrics: {
        listeningTime: {
            total: number;             // Temps total d'écoute en millisecondes
            bySections: {[key: string]: number}; // Temps par section en millisecondes
        };
        recordingCount: number;        // Nombre d'enregistrements
        buttonClicks: {[key: string]: number}; // Nombre de clics par type de bouton
        interfaceTime: number;         // Temps passé sur l'interface en millisecondes
        speedChanges: {
            count: number;             // Nombre de changements de vitesse
            values: number[];          // Valeurs de vitesse utilisées
        };
        looperActions: {
            recordCount: number;       // Clics sur Record
            playCount: number;         // Clics sur Play
            layerRemoveCount: number;  // Clics sur Remove Layer
            saveCount: number;         // Clics sur Save
        };
        scores: {[sectionIndex: string]: number}; // Scores obtenus par section
        [key: string]: any;             // Permet d'ajouter des métriques dynamiquement
    };
}

// Tampon en mémoire pour collecter les événements avant envoi
let currentSession: TrainingSession | null = null;
let bufferTimeout: NodeJS.Timeout | null = null;
let sessionId: string | null = null;

// Initialiser une nouvelle session d'entraînement
export function startTrainingSession(learnerName: string, soundId: string, soundTitle: string = ""): void {
    const now = Date.now();
    
    // Créer des timestamps formatés
    const dateObj = new Date();
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();
    const hours = String(dateObj.getHours()).padStart(2, "0");
    const minutes = String(dateObj.getMinutes()).padStart(2, "0");
    
    const dateFormatted = `${day}/${month}/${year}`;
    const timeFormatted = `${hours}h${minutes}`;
    
    // Vérifier si une session est déjà en cours et si elle est encore valide
    if (currentSession && (now - currentSession.lastActivity < SESSION_TIMEOUT_MS)) {
        // Mettre à jour la session existante
        currentSession.lastActivity = now;
        return;
    }
    
    // Générer un identifiant unique pour la session
    sessionId = `${learnerName}_${soundId}_${now}`;
    
    // Créer une nouvelle session avec des métriques initialisées
    currentSession = {
        id: sessionId,
        startTime: now,
        date: dateFormatted,
        time: timeFormatted,
        learnerName,
        soundId,
        soundTitle,
        events: [],
        lastActivity: now,
        metrics: {
            listeningTime: {
                total: 0,
                bySections: {}
            },
            recordingCount: 0,
            buttonClicks: {},
            interfaceTime: 0,
            speedChanges: {
                count: 0,
                values: []
            },
            looperActions: {
                recordCount: 0,
                playCount: 0,
                layerRemoveCount: 0,
                saveCount: 0
            },
            scores: {}
        }
    };
    
    // Programmation du premier envoi
    scheduleFlush();
}

// Terminer la session d'entraînement et envoyer les données finales
export function endTrainingSession(): void {
    if (!currentSession) return;
    
    const now = Date.now();
    
    // Calculer la durée totale d'interface
    currentSession.duration = now - currentSession.startTime;
    currentSession.metrics.interfaceTime = now - currentSession.startTime;
    currentSession.lastActivity = now;
    
    // Ajouter un événement de fin de session
    trackEvent("session_end", null);
    
    // Forcer l'envoi immédiat des données
    flushEvents(true);
    
    // Réinitialiser
    if (bufferTimeout) {
        clearTimeout(bufferTimeout);
        bufferTimeout = null;
    }
    
    currentSession = null;
    sessionId = null;
}

// Enregistrer un événement d'entraînement
export function trackEvent(eventType: string, value: any = null): void {
    if (!currentSession) return;
    
    const now = Date.now();
    currentSession.lastActivity = now;
    
    currentSession.events.push({
        type: eventType,
        value,
        timestamp: now
    });
    
    // Mettre à jour les métriques spécifiques selon le type d'événement
    updateMetricsForEvent(eventType, value);
    
    // Programmation d'un envoi si pas déjà fait
    scheduleFlush();
}

// Mettre à jour les métriques en fonction du type d'événement
function updateMetricsForEvent(eventType: string, value: any): void {
    if (!currentSession) return;
    
    // Incrémenter le compteur de clics pour ce type de bouton
    if (!currentSession.metrics.buttonClicks[eventType]) {
        currentSession.metrics.buttonClicks[eventType] = 1;
    } else {
        currentSession.metrics.buttonClicks[eventType]++;
    }
    
    // Traitement spécifique selon le type d'événement
    switch (eventType) {
        case TrainingEventTypes.RECORDING_START:
            currentSession.metrics.recordingCount++;
            break;
            
        case TrainingEventTypes.SECTION_LISTEN:
            if (value && typeof value.sectionIndex === 'number') {
                const sectionIndex = String(value.sectionIndex);
                // Les durées d'écoute sont traitées séparément par trackSectionListeningTime
            }
            break;
            
        case TrainingEventTypes.SECTION_SCORE:
            if (value && typeof value.sectionIndex === 'number' && typeof value.score === 'number') {
                const sectionIndex = String(value.sectionIndex);
                currentSession.metrics.scores[sectionIndex] = value.score;
            }
            break;
            
        case TrainingEventTypes.PLAYBACK_SPEED_CHANGE:
            currentSession.metrics.speedChanges.count++;
            if (value && typeof value.newSpeed === 'number') {
                currentSession.metrics.speedChanges.values.push(value.newSpeed);
            }
            break;
            
        case TrainingEventTypes.LOOP_RECORD_START:
            currentSession.metrics.looperActions.recordCount++;
            break;
            
        case TrainingEventTypes.LOOP_PLAY_START:
            currentSession.metrics.looperActions.playCount++;
            break;
            
        case TrainingEventTypes.LOOP_REMOVE_LAYER:
            currentSession.metrics.looperActions.layerRemoveCount++;
            break;
            
        case TrainingEventTypes.LOOP_SAVE:
            currentSession.metrics.looperActions.saveCount++;
            break;
    }
}

// Enregistrer une métrique avec une valeur spécifique
export function trackMetric(metricName: string, value: number): void {
    if (!currentSession) return;
    
    const now = Date.now();
    currentSession.lastActivity = now;
    
    // Mettre à jour la métrique spécifiée
    if (!currentSession.metrics[metricName]) {
        currentSession.metrics[metricName] = value;
    } else {
        currentSession.metrics[metricName] += value;
    }
    
    // Programmation d'un envoi si pas déjà fait
    scheduleFlush();
}

// Enregistrer une métrique pour une section spécifique
export function trackSectionMetric(sectionIndex: number, metricName: string, value: number): void {
    if (!currentSession) return;
    
    const now = Date.now();
    currentSession.lastActivity = now;
    
    const sectionKey = String(sectionIndex);
    if (!currentSession.metrics[metricName]) {
        currentSession.metrics[metricName] = {};
    }
    
    if (!currentSession.metrics[metricName][sectionKey]) {
        currentSession.metrics[metricName][sectionKey] = value;
    } else {
        currentSession.metrics[metricName][sectionKey] += value;
    }
    
    // Programmation d'un envoi si pas déjà fait
    scheduleFlush();
}

// Enregistrer le temps d'écoute pour une section
export function trackSectionListeningTime(sectionIndex: number, durationMs: number): void {
    if (!currentSession) return;
    
    const now = Date.now();
    currentSession.lastActivity = now;
    
    // Mettre à jour le temps total d'écoute
    currentSession.metrics.listeningTime.total += durationMs;
    
    // Mettre à jour le temps d'écoute pour cette section
    const sectionKey = String(sectionIndex);
    if (!currentSession.metrics.listeningTime.bySections[sectionKey]) {
        currentSession.metrics.listeningTime.bySections[sectionKey] = durationMs;
    } else {
        currentSession.metrics.listeningTime.bySections[sectionKey] += durationMs;
    }
    
    // Programmation d'un envoi si pas déjà fait
    scheduleFlush();
}

// Programmer l'envoi des données
function scheduleFlush(): void {
    if (bufferTimeout) return; // Déjà programmé
    
    bufferTimeout = setTimeout(() => {
        flushEvents();
    }, 10000); // Envoyer toutes les 10 secondes
}

// Formatter les résultats pour l'affichage et le stockage
function formatSessionForDisplay(session: TrainingSession): any {
    const formattedSession = {
        title: session.soundTitle,
        date: `${session.date} - ${session.time}`,
        listeningTime: {
            total: `${Math.round(session.metrics.listeningTime.total / 60000 * 100) / 100} minutes`,
            bySections: {} as {[key: string]: string}
        },
        recordingCount: session.metrics.recordingCount,
        buttonClicks: session.metrics.buttonClicks,
        interfaceTime: `${Math.round(session.metrics.interfaceTime / 60000 * 100) / 100} minutes`,
        speedChanges: {
            count: session.metrics.speedChanges.count,
            values: session.metrics.speedChanges.values
        },
        looperActions: session.metrics.looperActions,
        scores: session.metrics.scores
    };
    
    // Formatter les temps d'écoute par section en minutes
    for (const [sectionIndex, timeMs] of Object.entries(session.metrics.listeningTime.bySections)) {
        formattedSession.listeningTime.bySections[sectionIndex] = 
            `${Math.round(timeMs / 60000 * 100) / 100} minutes`;
    }
    
    return formattedSession;
}

// Envoyer les données vers Firebase
async function flushEvents(isFinal: boolean = false): Promise<void> {
    if (!currentSession || !sessionId || !currentSession.learnerName) return;
    const session = currentSession;
    const sid = sessionId;

    try {
        // Créer une référence au document principal de l'apprenant
        const learnerDocRef = doc(db, ANALYTICS_COLLECTION, session.learnerName);
        
        // Vérifier si le document de l'apprenant existe déjà
        const learnerDoc = await getDoc(learnerDocRef);
        let sessions: {[id: string]: any} = {};
        
        if (learnerDoc.exists()) {
            // Récupérer les sessions existantes
            sessions = learnerDoc.data()?.sessions || {};
        }
        
        // Formater la session courante
        const formattedSession = formatSessionForDisplay(session);
        
        // Ajouter les informations finales si nécessaire
        if (isFinal) {
            Object.assign(formattedSession, {
                isComplete: true,
            });
            
            // Ajouter les événements bruts seulement à la fin pour l'analyse détaillée
            // formattedSession.events = session.events;
        }
        
        // Mettre à jour ou créer l'entrée de session
        sessions[sid] = formattedSession;
        
        // Mettre à jour le document avec les sessions
        await setDoc(learnerDocRef, {
            name: session.learnerName,
            sessions: sessions,
            updatedAt: serverTimestamp(),
        }, { merge: true });
        
        // Réinitialiser les événements après l'envoi si ce n'est pas la fin
        if (!isFinal) {
            session.events = [];
        }
        
        console.log(`Analytics: flushed ${isFinal ? 'final' : 'interim'} data for ${session.learnerName}`);
    } catch (error) {
        console.error("Error saving analytics data:", error);
    } finally {
        // Réinitialiser le timeout
        bufferTimeout = null;
        
        // Reprogrammer si ce n'est pas la fin
        if (!isFinal) {
            scheduleFlush();
        }
    }
}

// Exporter les constantes pour les types d'événements
export const TrainingEventTypes = {
    // Events généraux
    SESSION_START: "session_start",
    SESSION_END: "session_end",
    PAGE_LEAVE: "page_leave",
    
    // Interactions avec les sections
    SECTION_PLAY: "section_play",
    SECTION_LISTEN: "section_listen",
    SECTION_PERFORM: "section_perform",
    SECTION_SCORE: "section_score",
    
    // Interactions UI
    PLAYBACK_SPEED_CHANGE: "playback_speed_change",
    RECORDING_START: "recording_start",
    RECORDING_STOP: "recording_stop",
    SAVE_RECORDING: "save_recording",
    DELETE_RECORDING: "delete_recording",
    
    // Looper events
    LOOP_RECORD_START: "loop_record_start",
    LOOP_RECORD_STOP: "loop_record_stop",
    LOOP_PLAY_START: "loop_play_start",
    LOOP_PLAY_STOP: "loop_play_stop",
    LOOP_SAVE: "loop_save",
    LOOP_REMOVE_LAYER: "loop_remove_layer"
};