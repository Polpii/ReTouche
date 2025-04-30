"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLearnerContext } from "../context/LearnerContext";

export default function LearnerProfilePage() {
  const router = useRouter();
  const { learners, addLearner } = useLearnerContext();
  const [newName, setNewName] = useState("");

  // Ajout d'un effet pour ouvrir un deuxième écran
  useEffect(() => {
    // Ouvrir la fenêtre du deuxième écran
    const secondWindow = window.open("", "mirrorFugueSecondScreen", 
      "width=1280,height=720,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no,status=no");
    
    if (secondWindow) {
      // Configurer le contenu initial de la fenêtre
      // Utilisation de writeHTML pour éviter les problèmes avec les caractères spéciaux
      const htmlContent = `<!DOCTYPE html>
        <html>
          <head>
            <title>MirrorFugue - Secondary Display</title>
            <meta charset="utf-8">
            <style>
              html, body { 
                margin: 0; 
                padding: 0; 
                width: 100%;
                height: 100%;
                background-color: black; 
                color: white; 
                font-family: Arial, sans-serif;
                overflow: hidden;
              }
              
              #videoContainer {
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                position: relative;
              }
              
              #message {
                font-size: 1.5rem;
                text-align: center;
              }
              
              .transform-container {
                position: absolute;
                transform-origin: 0 0;
              }
              
              video {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain !important; /* Force contain pour voir la vidéo entière */
              }
            </style>
          </head>
          <body>
            <div id="videoContainer">
              <div id="message">Ecran secondaire MirrorFugue<br>En attente de la session...</div>
            </div>
            <script>
              // Stocker la référence de cette fenêtre dans localStorage
              localStorage.setItem("mirrorFugueSecondScreenOpen", "true");
              
              // Fonction qui sera appelée par la fenêtre principale pour recevoir les vidéos
              window.receiveVideo = function(videoElement, transformConfig) {
                const container = document.getElementById("videoContainer");
                container.innerHTML = "";  // Vider le conteneur
                
                if (videoElement) {
                  // Configurer les styles de la vidéo pour un affichage correct
                  videoElement.style.maxWidth = '100%';
                  videoElement.style.maxHeight = '100%';
                  videoElement.style.objectFit = 'contain';
                  videoElement.style.width = 'auto';
                  videoElement.style.height = 'auto';
                  
                  // Si une configuration de transformation est fournie, l'appliquer
                  if (transformConfig) {
                    const transformContainer = document.createElement("div");
                    transformContainer.className = "transform-container";
                    
                    // Vérifier si nous avons besoin d'appliquer la transformation
                    const hasCustomTransform = transformConfig.perspectivePoints && 
                      (transformConfig.perspectivePoints.topLeft.x !== 0 || 
                       transformConfig.perspectivePoints.topLeft.y !== 0 ||
                       transformConfig.perspectivePoints.topRight.x !== 640 ||
                       transformConfig.perspectivePoints.topRight.y !== 0 ||
                       transformConfig.perspectivePoints.bottomRight.x !== 640 ||
                       transformConfig.perspectivePoints.bottomRight.y !== 360 ||
                       transformConfig.perspectivePoints.bottomLeft.x !== 0 ||
                       transformConfig.perspectivePoints.bottomLeft.y !== 360);
                       
                    if (hasCustomTransform) {
                      // Appliquer les transformations avec la même perspective
                      const points = transformConfig.perspectivePoints;
                      const topLeftX = points.topLeft.x;
                      const topLeftY = points.topLeft.y;
                      const topRightX = points.topRight.x;
                      const topRightY = points.topRight.y;
                      const bottomLeftX = points.bottomLeft.x;
                      const bottomLeftY = points.bottomLeft.y;
                      const bottomRightX = points.bottomRight.x;
                      const bottomRightY = points.bottomRight.y;
                      
                      // Calculer la matrice de perspective
                      transformContainer.style.transform = 
                        \`matrix3d(
                          \${topRightX - topLeftX}, \${topRightY - topLeftY}, 0, 0,
                          \${bottomLeftX - topLeftX}, \${bottomLeftY - topLeftY}, 0, 0,
                          0, 0, 1, 0,
                          \${topLeftX}, \${topLeftY}, 0, 1
                        )\`;
                    }
                    
                    // Ajouter la position si spécifiée, avec offset pour centrage
                    if (transformConfig.position) {
                      const centerOffsetX = (window.innerWidth - (transformConfig.baseWidth || 640)) / 2;
                      const centerOffsetY = (window.innerHeight - (transformConfig.baseHeight || 360)) / 2;
                      transformContainer.style.left = (transformConfig.position.x + centerOffsetX) + "px";
                      transformContainer.style.top = (transformConfig.position.y + centerOffsetY) + "px";
                    }
                    
                    // Si la vidéo ne semble pas avoir de transformation spécifique, on utilise un conteneur simple
                    if (!hasCustomTransform && !transformConfig.position) {
                      container.appendChild(videoElement);
                    } else {
                      transformContainer.appendChild(videoElement);
                      container.appendChild(transformContainer);
                    }
                  } else {
                    // Sans configuration de transformation, ajouter directement l'élément vidéo
                    container.appendChild(videoElement);
                  }
                } else {
                  container.innerHTML = "<div id='message'>Ecran secondaire MirrorFugue<br>En attente de la session...</div>";
                }
              };
              
              // Écouter la fermeture de la fenêtre
              window.addEventListener("beforeunload", function() {
                localStorage.removeItem("mirrorFugueSecondScreenOpen");
              });
              
              // Fonction utilitaire pour gérer les redimensionnements
              function handleResize() {
                console.log("Second screen resized:", window.innerWidth, "×", window.innerHeight);
              }
              
              window.addEventListener("resize", handleResize);
              console.log("Second screen initialized:", window.innerWidth, "×", window.innerHeight);
            </script>
          </body>
        </html>`;

      // Écrire le contenu HTML dans la fenêtre secondaire
      secondWindow.document.open();
      secondWindow.document.write(htmlContent);
      secondWindow.document.close();
      
      // Stocker la référence de la fenêtre dans sessionStorage
      sessionStorage.setItem('mirrorFugueSecondWindow', 'open');
    }
    
    // Nettoyer lors du démontage du composant
    return () => {
      // Ne pas fermer la fenêtre secondaire automatiquement car elle doit rester ouverte pendant la navigation
    };
  }, []);

  const handleCreate = () => {
    if (newName.trim() !== "") {
      // Ajoute le nouveau learner
      addLearner(newName.trim());
      // Redirige vers /learner/select-sound
      router.push("/learner/select-sound");
    }
  };

  return (
    <div style={{ padding: "1rem", fontFamily: "Arial, sans-serif", width: "100%" }}>
      {/* Bouton Home */}
      <Link href="/">
        <button
          style={{
            backgroundColor: "#0070f3",
            color: "#fff",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            cursor: "pointer",
            marginBottom: "1rem",
          }}
        >
          Home
        </button>
      </Link>

      <h3 style={{ marginBottom: "1rem" }}>Learner Profiles</h3>

      {/* Formulaire pour créer un nouveau profil */}
      <div style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Enter new learner name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{
            padding: "0.5rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            marginRight: "0.5rem",
          }}
        />
        <button
          onClick={handleCreate}
          style={{
            backgroundColor: "#28a745",
            color: "#fff",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Create
        </button>
      </div>

      {/* Liste des profils existants */}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {learners.map((learner) => (
          <li key={learner.name} style={{ marginBottom: "0.5rem" }}>
            <button
              onClick={() => {
                // On pourrait stocker le learner sélectionné dans un context 
                // ou dans localStorage, si besoin.
                router.push("/learner/select-sound");
              }}
              style={{
                padding: "0.5rem 1rem",
                cursor: "pointer",
                border: "1px solid #0070f3",
                backgroundColor: "#fff",
                borderRadius: "4px",
                color: "#0070f3",
              }}
            >
              {learner.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
