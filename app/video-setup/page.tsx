"use client";

import React, { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import PerspectiveTransform, { Points } from "../../components/PerspectiveTransform";
import { saveCalibrationConfig, CalibrationConfig } from "../services/calibrationService";
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
  const secondScreenVideoRefFull = useRef<HTMLVideoElement>(null);
  const secondScreenVideoRefTransform = useRef<HTMLVideoElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  // État pour activer/désactiver le deuxième écran
  const [showSecondScreen, setShowSecondScreen] = useState(false);

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
        // Premier écran
        if (videoRefFull.current) {
          videoRefFull.current.srcObject = mediaStream;
        }
        if (videoRefTransform.current) {
          videoRefTransform.current.srcObject = mediaStream;
        }
        // Deuxième écran
        if (secondScreenVideoRefFull.current) {
          secondScreenVideoRefFull.current.srcObject = mediaStream;
        }
        if (secondScreenVideoRefTransform.current) {
          secondScreenVideoRefTransform.current.srcObject = mediaStream;
        }
      })
      .catch((err) => console.error("Webcam error:", err));

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

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

    const configToSave: CalibrationConfig = {
      normalizedCrop,
      normalizedPoints,
      normalizedVideoOffset,
      baseWidth,
      baseHeight,
    };

    try {
      // Save to Firebase
      await saveCalibrationConfig("calibration-recorded", configToSave);

      // Still allow local file download
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

      alert("Configuration sauvegardée !");
    } catch (err) {
      console.error("File save error", err);
      
      // Try to save to Firebase even if the file save failed
      try {
        await saveCalibrationConfig("calibration-recorded", configToSave);
        alert("Configuration sauvegardée sur Firebase (échec de sauvegarde en fichier local)");
      } catch (firebaseErr) {
        console.error("Firebase save error", firebaseErr);
        alert("Erreur: Impossible de sauvegarder la configuration");
      }
    }
  };

  // Fonction pour activer/désactiver le deuxième écran
  const toggleSecondScreen = () => {
    setShowSecondScreen(!showSecondScreen);
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

      {/* Bouton pour activer le deuxième écran */}
      <div style={{ textAlign: "center", marginTop: "1rem" }}>
        <button
          onClick={toggleSecondScreen}
          style={{
            backgroundColor: showSecondScreen ? "#28a745" : "#6c757d",
            color: "#fff",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            cursor: "pointer",
            marginRight: "1rem",
          }}
        >
          {showSecondScreen ? "Désactiver 2ème écran" : "Activer 2ème écran"}
        </button>
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
      </div>

      {/* Portail vers le deuxième écran */}
      {showSecondScreen && (
        <VideoPortal width={1280} height={720}>
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            {/* Vidéo complète sur le second écran */}
            <div style={{ position: "relative", width: "100%" }}>
              <video ref={secondScreenVideoRefFull} autoPlay style={{ width: "100%" }} />
            </div>
            
            {/* Vidéo transformée sur le second écran */}
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
                editable={false} // La calibration se fait seulement sur le premier écran
                enableGroupDrag={false}
              >
                <video
                  ref={secondScreenVideoRefTransform}
                  autoPlay
                  style={{
                    position: "absolute",
                    left: -crop.x,
                    top: -crop.y,
                    width: "100%",
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
