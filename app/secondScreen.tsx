"use client";

import React, { useState, useEffect, useRef } from 'react';
import PerspectiveTransform, { Points } from '@/components/PerspectiveTransform';

// Styles spécifiques pour la fenêtre secondaire
const secondScreenStyles = `
html, body { 
  margin: 0; 
  padding: 0; 
  width: 100%; 
  height: 100%; 
  background: black; 
  overflow: hidden; 
}

#root {
  width: 100%;
  height: 100%;
}

.second-screen-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.video-wrapper {
  position: relative;
}

video.clone {
  display: block;
  max-width: 100%;
  max-height: 100%;
}
`;

interface SecondScreenProps {}

const SecondScreen: React.FC<SecondScreenProps> = () => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoProps, setVideoProps] = useState<{
    muted: boolean;
    playsInline: boolean;
    controls: boolean;
    style?: React.CSSProperties;
  }>({
    muted: true,
    playsInline: true,
    controls: false
  });
  const [videoSize, setVideoSize] = useState({ width: 640, height: 360 });
  const [editable, setEditable] = useState(false);
  const [points, setPoints] = useState<Points>({
    topLeft: { x: 0, y: 0 },
    topRight: { x: videoSize.width, y: 0 },
    bottomRight: { x: videoSize.width, y: videoSize.height },
    bottomLeft: { x: 0, y: videoSize.height }
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);

  // Initialisation - exposer les fonctions à la fenêtre parente
  useEffect(() => {
    // Signaler que la fenêtre est prête
    if (window.opener) {
      window.opener.postMessage({
        type: 'secondScreenReady'
      }, '*');
    }
    
    // Écouter les touches clavier pour le mode édition
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p') {
        setEditable(prev => {
          const newEditable = !prev;
          // Notifier la fenêtre parente du changement
          if (window.opener) {
            window.opener.postMessage({
              type: 'editableChanged',
              editable: newEditable
            }, '*');
          }
          return newEditable;
        });
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    // Exposer les fonctions à la fenêtre parente
    (window as any).receiveVideo = receiveVideo;
    (window as any).setEditable = setEditable;
    (window as any).resetPerspectivePoints = resetPerspectivePoints;
    
    // Marquer comme initialisé pour éviter les doubles initialisations
    localStorage.setItem('mirrorFugueSecondScreenOpen', 'true');
    
    // Nettoyage
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Synchroniser l'état de lecture avec la source vidéo
  useEffect(() => {
    if (!videoRef.current || !videoSrc) return;
    
    const videoEl = videoRef.current;
    
    // Définir les fonctions pour synchroniser la vidéo
    const syncCurrentTime = (sourceTime: number) => {
      if (Math.abs(videoEl.currentTime - sourceTime) > 0.2) {
        videoEl.currentTime = sourceTime;
      }
    };
    
    const syncPlaybackRate = (rate: number) => {
      videoEl.playbackRate = rate;
    };
    
    // Écouter les messages de la fenêtre parente
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      
      switch (event.data.type) {
        case 'videoSync':
          if (event.data.currentTime !== undefined) {
            syncCurrentTime(event.data.currentTime);
          }
          if (event.data.playbackRate !== undefined) {
            syncPlaybackRate(event.data.playbackRate);
          }
          if (event.data.playing !== undefined) {
            if (event.data.playing && videoEl.paused) {
              videoEl.play().catch(err => console.error('Failed to play:', err));
            } else if (!event.data.playing && !videoEl.paused) {
              videoEl.pause();
            }
          }
          break;
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [videoSrc]);

  // Fonction pour recevoir une vidéo de la fenêtre parente
  const receiveVideo = (
    newVideo: HTMLVideoElement | null,
    cfg?: {
      perspectivePoints?: Points;
      baseWidth?: number;
      baseHeight?: number;
      editable?: boolean;
      videoOffset?: { x: number; y: number };
    }
  ) => {
    // Si pas de vidéo, nettoyer l'état
    if (!newVideo) {
      setVideoSrc(null);
      setEditable(false);
      return;
    }
    
    // Déterminer la taille de la vidéo
    const newWidth = cfg?.baseWidth || newVideo.videoWidth || 640;
    const newHeight = cfg?.baseHeight || newVideo.videoHeight || 360;
    
    // Configurer l'état du composant
    setVideoSrc(newVideo.src);
    setVideoSize({ width: newWidth, height: newHeight });
    
    // Configurer les propriétés de la vidéo
    setVideoProps({
      muted: newVideo.muted,
      playsInline: true,
      controls: false,
      style: cfg?.videoOffset ? {
        position: 'relative',
        left: `-${cfg?.videoOffset.x}px`,
        top: `-${cfg?.videoOffset.y}px`
      } : undefined
    });
    
    // Configurer l'édition si spécifié
    if (cfg?.editable !== undefined) {
      setEditable(cfg.editable);
    }
    
    // Utiliser les points fournis ou réinitialiser
    if (cfg?.perspectivePoints) {
      setPoints(cfg.perspectivePoints);
    } else {
      resetPerspectivePoints();
    }
    
    // Synchroniser l'état initial
    if (videoRef.current) {
      videoRef.current.currentTime = newVideo.currentTime;
      videoRef.current.playbackRate = newVideo.playbackRate;
      
      if (!newVideo.paused) {
        videoRef.current.play().catch(err => 
          console.error('Failed to play initially:', err)
        );
      }
    }
  };

  // Réinitialiser les points aux valeurs par défaut
  const resetPerspectivePoints = () => {
    if (!videoWrapperRef.current) return;
    
    const container = videoWrapperRef.current.parentElement;
    if (!container) return;
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Position centrée par défaut
    const left = (containerWidth - videoSize.width) / 2;
    const top = (containerHeight - videoSize.height) / 2;
    
    const newPoints = {
      topLeft: { x: left, y: top },
      topRight: { x: left + videoSize.width, y: top },
      bottomRight: { x: left + videoSize.width, y: top + videoSize.height },
      bottomLeft: { x: left, y: top + videoSize.height }
    };
    
    setPoints(newPoints);
    
    // Notifier la fenêtre parente du changement
    if (window.opener) {
      window.opener.postMessage({
        type: 'perspectivePointsChanged',
        points: newPoints
      }, '*');
    }
  };

  // Gérer les changements de points
  const handlePointsChange = (newPoints: Points) => {
    setPoints(newPoints);
    
    // Envoyer les nouveaux points à la fenêtre parente
    if (window.opener) {
      window.opener.postMessage({
        type: 'perspectivePointsChanged',
        points: newPoints
      }, '*');
    }
  };

  return (
    <>
      <style jsx global>{secondScreenStyles}</style>
      <div className="second-screen-container">
        <div ref={videoWrapperRef} className="video-wrapper">
          {videoSrc && (
            <PerspectiveTransform
              points={points}
              onPointsChange={handlePointsChange}
              editable={editable}
              enableGroupDrag={true}
            >
              <video
                ref={videoRef}
                className="clone"
                src={videoSrc}
                {...videoProps}
              />
            </PerspectiveTransform>
          )}
        </div>
      </div>
    </>
  );
};

export default SecondScreen;
