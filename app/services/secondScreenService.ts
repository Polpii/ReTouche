// secondScreenService.ts
// Service pour gérer l'affichage des vidéos sur un deuxième écran

// Types pour les transformations
export interface Point {
  x: number;
  y: number;
}

export interface PerspectivePoints {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export interface TransformConfig {
  perspectivePoints?: PerspectivePoints;
  position?: { x: number; y: number };
  videoOffset?: { x: number; y: number };
  crop?: { x: number; y: number; width: number; height: number };
  baseWidth?: number;
  baseHeight?: number;
  editable?: boolean;
}

// Clé dans localStorage pour indiquer que la fenêtre secondaire est ouverte
const SECOND_SCREEN_FLAG = 'mirrorFugueSecondScreenOpen';
const PERSPECTIVE_POINTS_STORAGE_KEY = 'mirrorFuguePerspectivePoints';

// URL pour la fenêtre secondaire React
const SECOND_SCREEN_URL = '/secondScreen';

/**
 * Vérifie si une fenêtre secondaire est ouverte et qu'elle a bien implémenté receiveVideo
 */
export function isSecondScreenAvailable(): boolean {
  const isOpen = localStorage.getItem(SECOND_SCREEN_FLAG) === 'true';
  if (!isOpen) return false;
  const win = window.open('', 'mirrorFugueSecondScreen');
  return (
    win !== null &&
    !win.closed &&
    typeof (win as any).receiveVideo === 'function'
  );
}

/**
 * Ouvre ou récupère la fenêtre secondaire
 */
export function getSecondScreen(): Window | null {
  // Si la fenêtre est déjà ouverte, essayer de la récupérer
  if (localStorage.getItem(SECOND_SCREEN_FLAG) === 'true') {
    const existing = window.open('', 'mirrorFugueSecondScreen');
    if (existing && !existing.closed && typeof (existing as any).receiveVideo === 'function') {
      return existing;
    }
  }
  
  // Ouvrir une nouvelle fenêtre avec notre app React
  const popup = window.open(
    SECOND_SCREEN_URL,
    'mirrorFugueSecondScreen',
    'width=800,height=600'
  );
  
  if (!popup) {
    console.error('[SecondScreen] Failed to open second screen window');
    return null;
  }
  
  localStorage.setItem(SECOND_SCREEN_FLAG, 'true');
  
  // Configurer un gestionnaire pour attendre que la fenêtre soit prête
  const readyPromise = new Promise<Window>((resolve) => {
    const messageHandler = (event: MessageEvent) => {
      if (event.data && event.data.type === 'secondScreenReady') {
        window.removeEventListener('message', messageHandler);
        resolve(popup);
      }
    };
    
    window.addEventListener('message', messageHandler);
    
    // Timeout au cas où la fenêtre ne répond pas
    setTimeout(() => {
      window.removeEventListener('message', messageHandler);
      console.warn('[SecondScreen] Timeout waiting for second screen ready');
    }, 10000);
  });
  
  // Retourner la fenêtre immédiatement (le chargement peut prendre un moment)
  return popup;
}

/**
 * Clone et envoie une vidéo vers le second écran, synchronise lecture et contrôle
 * @param element Élément vidéo ou div contenant une vidéo
 * @param transformConfig Configuration de transformation optionnelle
 */
export function sendVideoToSecondScreen(
  element: HTMLVideoElement | HTMLDivElement | null,
  transformConfig?: TransformConfig
): HTMLVideoElement | null {
  if (!element) return null;
  const popup = getSecondScreen();
  if (!popup) return null;
  
  // Déterminer si l'élément est directement une vidéo ou un conteneur
  let videoElement: HTMLVideoElement | null;
  
  if (element instanceof HTMLVideoElement) {
    videoElement = element;
  } else if (element instanceof HTMLDivElement) {
    // Chercher la vidéo à l'intérieur du div
    videoElement = element.querySelector('video');
    
    // Si pas de vidéo, essaie de trouver récursivement dans les enfants
    if (!videoElement) {
      const findVideo = (el: Element): HTMLVideoElement | null => {
        if (el instanceof HTMLVideoElement) return el;
        for (let i = 0; i < el.children.length; i++) {
          const found = findVideo(el.children[i]);
          if (found) return found;
        }
        return null;
      };
      videoElement = findVideo(element);
    }
    
    if (!videoElement) {
      console.error('[SecondScreen] No video element found inside div:', element);
      return null;
    }
  } else {
    console.error('[SecondScreen] Invalid element type:', element);
    return null;
  }

  // Attendre que la fonction receiveVideo soit disponible
  const waitForReceiveVideo = () => {
    return new Promise<boolean>((resolve) => {
      if (typeof (popup as any).receiveVideo === 'function') {
        resolve(true);
        return;
      }
      
      let attempts = 0;
      const checkInterval = setInterval(() => {
        if (typeof (popup as any).receiveVideo === 'function') {
          clearInterval(checkInterval);
          resolve(true);
          return;
        }
        
        attempts++;
        if (attempts > 50) { // 5 secondes max d'attente
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  };

  // Créer le clone de la vidéo et l'envoyer au second écran
  const setupVideoClone = async () => {
    const isReady = await waitForReceiveVideo();
    if (!isReady) {
      console.error('[SecondScreen] Second screen not ready to receive video');
      return null;
    }
    
    try {
      // Créer un élément DOM pour le transfert (pas un vrai clone React)
      // Le composant React secondScreen utilisera juste les propriétés
      const dummyVideo = document.createElement('video');
      dummyVideo.src = videoElement!.src;
      dummyVideo.muted = videoElement!.muted;
      dummyVideo.playsInline = true;
      dummyVideo.controls = false;
      dummyVideo.currentTime = videoElement!.currentTime;
      dummyVideo.playbackRate = videoElement!.playbackRate;
      
      // Définir la largeur/hauteur naturelles pour la configuration de transformation
      if (!transformConfig) transformConfig = {};
      if (videoElement!.videoWidth && videoElement!.videoHeight) {
        transformConfig.baseWidth = videoElement!.videoWidth;
        transformConfig.baseHeight = videoElement!.videoHeight;
      }
      
      // Charger les points de perspective depuis localStorage si disponibles
      if (!transformConfig.perspectivePoints && localStorage.getItem(PERSPECTIVE_POINTS_STORAGE_KEY)) {
        try {
          const savedPoints = localStorage.getItem(PERSPECTIVE_POINTS_STORAGE_KEY);
          if (savedPoints) {
            transformConfig.perspectivePoints = JSON.parse(savedPoints);
          }
        } catch (e) {
          console.error('[SecondScreen] Failed to parse saved perspective points', e);
        }
      }
      
      // Envoyer la vidéo à la fenêtre secondaire avec sa configuration
      (popup as any).receiveVideo(dummyVideo, transformConfig);
      
      // Ajouter les écouteurs d'événements pour synchroniser l'état
      const syncVideoState = () => {
        popup.postMessage({
          type: 'videoSync',
          currentTime: videoElement!.currentTime,
          playbackRate: videoElement!.playbackRate,
          playing: !videoElement!.paused
        }, '*');
      };
      
      // Synchroniser régulièrement
      const syncInterval = setInterval(syncVideoState, 1000);
      
      // Synchroniser lors des événements spécifiques
      const onPlay = () => {
        popup.postMessage({
          type: 'videoSync',
          playing: true
        }, '*');
      };
      
      const onPause = () => {
        popup.postMessage({
          type: 'videoSync',
          playing: false
        }, '*');
      };
      
      const onSeek = () => {
        popup.postMessage({
          type: 'videoSync',
          currentTime: videoElement!.currentTime
        }, '*');
      };
      
      const onRate = () => {
        popup.postMessage({
          type: 'videoSync',
          playbackRate: videoElement!.playbackRate
        }, '*');
      };
      
      videoElement!.addEventListener('play', onPlay);
      videoElement!.addEventListener('pause', onPause);
      videoElement!.addEventListener('seeked', onSeek);
      videoElement!.addEventListener('ratechange', onRate);
      
      // Nettoyer les écouteurs quand la vidéo est terminée ou supprimée
      const cleanup = () => {
        clearInterval(syncInterval);
        videoElement?.removeEventListener('play', onPlay);
        videoElement?.removeEventListener('pause', onPause);
        videoElement?.removeEventListener('seeked', onSeek);
        videoElement?.removeEventListener('ratechange', onRate);
        videoElement?.removeEventListener('ended', cleanup);
      };
      
      videoElement!.addEventListener('ended', cleanup);
      
      // Si la fenêtre est fermée, nettoyer
      popup.addEventListener('unload', cleanup);
      
      return videoElement;
    } catch (err) {
      console.error('[SecondScreen] clone error:', err);
      return null;
    }
  };

  // Démarrer la configuration asynchrone
  setupVideoClone();
  return videoElement; // Retourner l'élément original
}

/**
 * Configure l'écouteur d'événements pour capter les changements de perspective depuis le second écran
 */
export function setupPerspectiveChangeListener(onPointsChange: (points: PerspectivePoints) => void): () => void {
  const messageHandler = (event: MessageEvent) => {
    if (event.data && event.data.type === 'perspectivePointsChanged') {
      // Sauvegarder dans localStorage
      try {
        localStorage.setItem(PERSPECTIVE_POINTS_STORAGE_KEY, JSON.stringify(event.data.points));
      } catch (e) {
        console.error('[SecondScreen] Failed to save perspective points', e);
      }
      
      onPointsChange(event.data.points);
    }
  };
  
  window.addEventListener('message', messageHandler);
  
  // Retourne une fonction pour nettoyer l'écouteur
  return () => {
    window.removeEventListener('message', messageHandler);
  };
}

/**
 * Configure l'écouteur d'événements pour capter les changements de mode édition
 */
export function setupEditableChangeListener(onEditableChange: (editable: boolean) => void): () => void {
  const messageHandler = (event: MessageEvent) => {
    if (event.data && event.data.type === 'editableChanged') {
      onEditableChange(event.data.editable);
    }
  };
  
  window.addEventListener('message', messageHandler);
  
  return () => {
    window.removeEventListener('message', messageHandler);
  };
}

/**
 * Efface la vidéo affichée sur le deuxième écran
 */
export function clearSecondScreen(): void {
  const popup = window.open('', 'mirrorFugueSecondScreen');
  if (!popup || typeof (popup as any).receiveVideo !== 'function') return;
  (popup as any).receiveVideo(null);
}

/**
 * Ferme la fenêtre secondaire
 */
export function closeSecondScreen(): void {
  const popup = window.open('', 'mirrorFugueSecondScreen');
  if (popup) {
    popup.close();
    localStorage.removeItem(SECOND_SCREEN_FLAG);
  }
}

/**
 * Active ou désactive le mode édition sur la fenêtre secondaire
 */
export function setSecondScreenEditable(editable: boolean): void {
  const popup = window.open('', 'mirrorFugueSecondScreen');
  if (!popup || typeof (popup as any).setEditable !== 'function') return;
  (popup as any).setEditable(editable);
}

/**
 * Réinitialise les points de perspective sur le second écran
 */
export function resetSecondScreenPerspective(): void {
  const popup = window.open('', 'mirrorFugueSecondScreen');
  if (!popup || typeof (popup as any).resetPerspectivePoints !== 'function') return;
  (popup as any).resetPerspectivePoints();
}

// Nettoyage automatique à la fermeture de la page
window.addEventListener('beforeunload', () => {
  closeSecondScreen();
});
