/**
 * Service pour gérer l'affichage des vidéos sur un deuxième écran
 */

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
}

/**
 * Vérifie si une fenêtre secondaire est ouverte et accessible
 */
export const isSecondScreenAvailable = (): boolean => {
  try {
    const isOpen = localStorage.getItem('mirrorFugueSecondScreenOpen') === 'true';
    console.log("[SecondScreen] Check availability - localStorage flag:", isOpen);
    
    if (!isOpen) return false;
    
    // Tenter de récupérer la référence vers le second écran
    const secondWindow = window.open('', 'mirrorFugueSecondScreen');
    console.log("[SecondScreen] Window reference obtained:", !!secondWindow);
    
    // Vérifier si la fenêtre existe, n'est pas fermée et a la fonction receiveVideo
    const isAvailable = secondWindow !== null && 
           !secondWindow.closed && 
           typeof secondWindow.receiveVideo === 'function';
    
    console.log("[SecondScreen] Available:", isAvailable, "- receiveVideo exists:", 
      secondWindow !== null ? typeof secondWindow.receiveVideo === 'function' : false);
    
    return isAvailable;
  } catch (error) {
    console.error("[SecondScreen] Error checking availability:", error);
    return false;
  }
};

/**
 * Récupère la référence vers la fenêtre du deuxième écran
 */
export const getSecondScreen = (): Window | null => {
  if (!isSecondScreenAvailable()) {
    console.log("[SecondScreen] Not available, cannot get reference");
    return null;
  }
  
  try {
    const secondWindow = window.open('', 'mirrorFugueSecondScreen');
    console.log("[SecondScreen] Reference obtained successfully");
    return secondWindow;
  } catch (error) {
    console.error("[SecondScreen] Error getting reference:", error);
    return null;
  }
};

/**
 * Envoie une vidéo vers le deuxième écran avec prise en charge des transformations
 * @param videoElement L'élément vidéo à cloner vers le deuxième écran
 * @param transformConfig Configuration optionnelle pour la transformation
 * @returns L'élément vidéo cloné ou null en cas d'erreur
 */
export const sendVideoToSecondScreen = (
  videoElement: HTMLVideoElement | null, 
  transformConfig?: TransformConfig
): HTMLVideoElement | null => {
  if (!videoElement) {
    console.log("[SecondScreen] Cannot send null video element");
    return null;
  }
  
  console.log("[SecondScreen] Attempting to send video with transform:", 
    videoElement.src.substring(0, 50) + "...", 
    transformConfig ? "With transform config" : "No transform config");
  
  const secondScreen = getSecondScreen();
  if (!secondScreen) {
    console.log("[SecondScreen] Cannot send video, second screen not available");
    return null;
  }
  
  try {
    // Créer un nouvel élément vidéo dans la fenêtre secondaire
    const clonedVideo = secondScreen.document.createElement('video');
    
    // Copier les attributs importants
    clonedVideo.src = videoElement.src;
    clonedVideo.muted = false; // Assurer que l'audio soit joué sur le second écran
    clonedVideo.controls = false;
    clonedVideo.playsInline = true;
    
    // Appliquer le style de base
    clonedVideo.style.width = '100%';
    clonedVideo.style.height = '100%';
    clonedVideo.style.objectFit = 'contain';
    
    // Si des offsets vidéo sont spécifiés dans la configuration, les appliquer
    if (transformConfig?.videoOffset) {
      clonedVideo.style.position = 'absolute';
      clonedVideo.style.left = `-${transformConfig.videoOffset.x}px`;
      clonedVideo.style.top = `-${transformConfig.videoOffset.y}px`;
    }
    
    // Si un crop est spécifié, l'appliquer
    if (transformConfig?.crop) {
      clonedVideo.style.width = `${transformConfig.baseWidth || 640}px`;
      clonedVideo.style.height = 'auto';
    }
    
    // Synchroniser le temps de lecture et le statut (play/pause)
    if (!videoElement.paused) {
      console.log("[SecondScreen] Original video is playing, syncing playback state");
      clonedVideo.currentTime = videoElement.currentTime;
      const playPromise = clonedVideo.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => console.error("[SecondScreen] Error playing cloned video:", error));
      }
    } else {
      console.log("[SecondScreen] Original video is paused, syncing pause state");
      clonedVideo.currentTime = videoElement.currentTime;
      clonedVideo.pause();
    }
    
    // Synchroniser la vitesse de lecture
    clonedVideo.playbackRate = videoElement.playbackRate;
    
    // Synchroniser l'état de lecture entre les deux vidéos
    const playHandler = () => {
      console.log("[SecondScreen] Original video played, syncing...");
      if (clonedVideo.paused) {
        clonedVideo.currentTime = videoElement.currentTime;
        clonedVideo.play().catch(e => console.error("[SecondScreen] Error syncing play:", e));
      }
    };
    
    const pauseHandler = () => {
      console.log("[SecondScreen] Original video paused, syncing...");
      if (!clonedVideo.paused) {
        clonedVideo.pause();
      }
    };
    
    const seekedHandler = () => {
      console.log("[SecondScreen] Original video seeked to:", videoElement.currentTime);
      clonedVideo.currentTime = videoElement.currentTime;
    };
    
    const rateChangeHandler = () => {
      console.log("[SecondScreen] Original video rate changed to:", videoElement.playbackRate);
      clonedVideo.playbackRate = videoElement.playbackRate;
    };
    
    videoElement.addEventListener('play', playHandler);
    videoElement.addEventListener('pause', pauseHandler);
    videoElement.addEventListener('seeked', seekedHandler);
    videoElement.addEventListener('ratechange', rateChangeHandler);
    
    // Cleanup des event listeners quand la vidéo est détruite
    clonedVideo.addEventListener('remove', () => {
      console.log("[SecondScreen] Cleaning up event listeners");
      videoElement.removeEventListener('play', playHandler);
      videoElement.removeEventListener('pause', pauseHandler);
      videoElement.removeEventListener('seeked', seekedHandler);
      videoElement.removeEventListener('ratechange', rateChangeHandler);
    });
    
    // Afficher la vidéo clonée sur le second écran avec la configuration de transformation
    console.log("[SecondScreen] Sending video to second screen via receiveVideo");
    secondScreen.receiveVideo(clonedVideo, transformConfig);
    
    return clonedVideo;
  } catch (error) {
    console.error("[SecondScreen] Error sending video to second screen:", error);
    return null;
  }
};

/**
 * Efface le contenu du deuxième écran
 */
export const clearSecondScreen = (): void => {
  const secondScreen = getSecondScreen();
  if (!secondScreen) {
    console.log("[SecondScreen] Cannot clear, second screen not available");
    return;
  }
  
  try {
    console.log("[SecondScreen] Clearing second screen");
    secondScreen.receiveVideo(null);
  } catch (error) {
    console.error("[SecondScreen] Error clearing second screen:", error);
  }
};

/**
 * Ferme le deuxième écran
 */
export const closeSecondScreen = (): void => {
  const secondScreen = getSecondScreen();
  if (!secondScreen) return;
  
  try {
    console.log("[SecondScreen] Closing second screen");
    secondScreen.close();
    localStorage.removeItem('mirrorFugueSecondScreenOpen');
  } catch (error) {
    console.error("[SecondScreen] Error closing second screen:", error);
  }
};