"use client";

import React, { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import PerspectiveTransform, { Points } from "../../components/PerspectiveTransform";
import VideoPortal from "../../components/VideoPortal";

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

const VIDEO_WIDTH = 640;

const VideoSetupPage: React.FC = () => {
  const videoRefFull = useRef<HTMLVideoElement>(null);
  const videoRefTransform = useRef<HTMLVideoElement>(null);
  
  // Références pour le deuxième écran
  const secondVideoRefFull = useRef<HTMLVideoElement>(null);
  const secondVideoRefTransform = useRef<HTMLVideoElement>(null);
  
  // État pour gérer la disponibilité du deuxième écran
  const [secondScreenEnabled, setSecondScreenEnabled] = useState(false);

  const [stream, setStream] = useState<MediaStream | null>(null);

  // État du crop (en pixels)
  const [crop, setCrop] = useState<Crop>({
    x: 100,
    y: 100,
    width: 300,
    height: 200,
  });

  // État des points de perspective (en pixels)
  const [perspectivePoints, setPerspectivePoints] = useState<Points>({
    topLeft: { x: 0, y: 0 },
    topRight: { x: 300, y: 0 },
    bottomRight: { x: 300, y: 200 },
    bottomLeft: { x: 0, y: 200 },
  });

  // Au montage, démarrer la webcam
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((mediaStream) => {
        setStream(mediaStream);
        if (videoRefFull.current) {
          videoRefFull.current.srcObject = mediaStream;
        }
        if (videoRefTransform.current) {
          videoRefTransform.current.srcObject = mediaStream;
        }
        // Préparer aussi le stream pour le deuxième écran si activé
        if (secondScreenEnabled) {
          if (secondVideoRefFull.current) {
            secondVideoRefFull.current.srcObject = mediaStream;
          }
          if (secondVideoRefTransform.current) {
            secondVideoRefTransform.current.srcObject = mediaStream;
          }
        }
      })
      .catch((err) => console.error("Webcam error:", err));

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [secondScreenEnabled]);

  // Synchroniser la lecture des vidéos entre les écrans
  useEffect(() => {
    const syncVideos = () => {
      if (videoRefFull.current && secondVideoRefFull.current) {
        // Synchroniser la lecture
        if (videoRefFull.current.paused) {
          secondVideoRefFull.current.pause();
        } else {
          secondVideoRefFull.current.currentTime = videoRefFull.current.currentTime;
          secondVideoRefFull.current.play().catch(err => console.error("Erreur de lecture sur le second écran:", err));
        }
      }
      
      if (videoRefTransform.current && secondVideoRefTransform.current) {
        // Synchroniser la lecture transformée
        if (videoRefTransform.current.paused) {
          secondVideoRefTransform.current.pause();
        } else {
          secondVideoRefTransform.current.currentTime = videoRefTransform.current.currentTime;
          secondVideoRefTransform.current.play().catch(err => console.error("Erreur de lecture transformée sur le second écran:", err));
        }
      }
    };
    
    // Ajouter des événements de synchronisation
    if (videoRefFull.current) {
      videoRefFull.current.addEventListener('play', syncVideos);
      videoRefFull.current.addEventListener('pause', syncVideos);
      videoRefFull.current.addEventListener('seeked', syncVideos);
    }
    
    if (videoRefTransform.current) {
      videoRefTransform.current.addEventListener('play', syncVideos);
      videoRefTransform.current.addEventListener('pause', syncVideos);
      videoRefTransform.current.addEventListener('seeked', syncVideos);
    }
    
    return () => {
      if (videoRefFull.current) {
        videoRefFull.current.removeEventListener('play', syncVideos);
        videoRefFull.current.removeEventListener('pause', syncVideos);
        videoRefFull.current.removeEventListener('seeked', syncVideos);
      }
      
      if (videoRefTransform.current) {
        videoRefTransform.current.removeEventListener('play', syncVideos);
        videoRefTransform.current.removeEventListener('pause', syncVideos);
        videoRefTransform.current.removeEventListener('seeked', syncVideos);
      }
    };
  }, [secondScreenEnabled]);

  // Au moment de sauvegarder, on enregistre :
  // - Les valeurs normalisées du crop et des points (par rapport aux dimensions réelles du flux)
  // - Les dimensions de base du flux
  // - La position appliquée à la vidéo (décalage : -crop.x et -crop.y)
  const handleDone = async () => {
    const baseWidth = videoRefFull.current?.videoWidth || VIDEO_WIDTH;
    const baseHeight = videoRefFull.current?.videoHeight || 480;

    const normalizedCrop = {
      x: crop.x / baseWidth,
      y: crop.y / baseHeight,
      width: crop.width / baseWidth,
      height: crop.height / baseHeight,
    };

    const normalizedPoints = {
      topLeft: { x: perspectivePoints.topLeft.x / baseWidth, y: perspectivePoints.topLeft.y / baseHeight },
      topRight: { x: perspectivePoints.topRight.x / baseWidth, y: perspectivePoints.topRight.y / baseHeight },
      bottomRight: { x: perspectivePoints.bottomRight.x / baseWidth, y: perspectivePoints.bottomRight.y / baseHeight },
      bottomLeft: { x: perspectivePoints.bottomLeft.x / baseWidth, y: perspectivePoints.bottomLeft.y / baseHeight },
    };

    // On enregistre aussi le "videoOffset" appliqué dans le rendu final (pour positionner la vidéo : left: -crop.x, top: -crop.y)
    const normalizedVideoOffset = {
      x: crop.x / baseWidth,
      y: crop.y / baseHeight,
    };

    const configToSave = {
      normalizedCrop,
      normalizedPoints,
      normalizedVideoOffset,
      baseWidth,
      baseHeight,
    };

    try {
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: "videoSetupConfig.json",
        types: [
          {
            description: "JSON config file",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(configToSave, null, 2));
      await writable.close();

      localStorage.setItem("calibration-recorded", JSON.stringify(configToSave));
      alert("Configuration sauvegardée !");
    } catch (err) {
      console.error("File save error", err);
    }
  };

  return (
    <>
      {/* Zone de la vidéo complète avec affichage du crop */}
      <div style={{ position: "relative", width: VIDEO_WIDTH, margin: "0 auto" }}>
        <video ref={videoRefFull} autoPlay style={{ width: "100%" }} />
        <Rnd
          size={{ width: crop.width, height: crop.height }}
          position={{ x: crop.x, y: crop.y }}
          bounds="parent"
          onDragStop={(e, d) => setCrop((prev) => ({ ...prev, x: d.x, y: d.y }))}
          onResizeStop={(e, direction, ref, delta, position) => {
            const newWidth = parseInt(ref.style.width, 10);
            const newHeight = parseInt(ref.style.height, 10);
            setCrop({
              x: position.x,
              y: position.y,
              width: newWidth,
              height: newHeight,
            });
            // Réinitialiser les points de perspective en fonction du nouveau crop
            setPerspectivePoints({
              topLeft: { x: 0, y: 0 },
              topRight: { x: newWidth, y: 0 },
              bottomRight: { x: newWidth, y: newHeight },
              bottomLeft: { x: 0, y: newHeight },
            });
          }}
          style={{ border: "2px dashed red" }}
        />
      </div>

      {/* Zone avec la vidéo recadrée et transformée */}
      <div style={{ position: "relative", width: VIDEO_WIDTH, margin: "20px auto" }}>
        <div
          style={{
            position: "absolute",
            left: crop.x,
            top: crop.y,
            width: crop.width,
            height: crop.height,
            overflow: "visible",
          }}
        >
          <PerspectiveTransform
            points={perspectivePoints}
            onPointsChange={setPerspectivePoints}
            editable={true}
            enableGroupDrag={true}
          >
            <video
              ref={videoRefTransform}
              autoPlay
              style={{
                position: "absolute",
                left: -crop.x,
                top: -crop.y,
                width: VIDEO_WIDTH,
              }}
            />
          </PerspectiveTransform>
        </div>
      </div>

      {/* Boutons de contrôle */}
      <div style={{ textAlign: "left", marginTop: "1rem", display: "flex", gap: "10px", alignItems: "center" }}>
        <button
          onClick={handleDone}
          style={{
            backgroundColor: "#28a745",
            color: "#fff",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Done
        </button>
        
        <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
          <input 
            type="checkbox" 
            checked={secondScreenEnabled}
            onChange={(e) => setSecondScreenEnabled(e.target.checked)} 
          />
          Activer le deuxième écran
        </label>
      </div>
      
      {/* Deuxième écran (affichage dans une fenêtre séparée) */}
      {secondScreenEnabled && (
        <VideoPortal width={1280} height={720}>
          {/* Zone de la vidéo complète */}
          <div style={{ position: "relative", width: "100%", height: "50%" }}>
            <video
              ref={secondVideoRefFull}
              autoPlay
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
          
          {/* Zone avec la vidéo transformée */}
          <div style={{ 
            position: "relative", 
            width: "100%", 
            height: "50%" 
          }}>
            <div
              style={{
                position: "absolute",
                left: crop.x,
                top: crop.y,
                width: crop.width,
                height: crop.height,
                overflow: "visible",
              }}
            >
              <PerspectiveTransform
                points={perspectivePoints}
                editable={false}
              >
                <video
                  ref={secondVideoRefTransform}
                  autoPlay
                  style={{
                    position: "absolute",
                    left: -crop.x,
                    top: -crop.y,
                    width: VIDEO_WIDTH,
                  }}
                />
              </PerspectiveTransform>
            </div>
          </div>
        </VideoPortal>
      )}
    </>
  );
};

export default VideoSetupPage;
