// components/VideoPortal.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";


interface VideoPortalProps {
  width?: number;    // facultatif : dimensions de la fenêtre vidéo
  height?: number;
  children: React.ReactNode;
}

export default function VideoPortal({ width = 800, height = 600, children }: VideoPortalProps) {
  const containerRef = useRef<HTMLDivElement>(document.createElement("div"));
  const [externalWindow, setExternalWindow] = useState<Window | null>(null);

  useEffect(() => {
    // on récupère la largeur de l'écran principal
    const mainWidth = window.screen.availWidth;
    // on ouvre la popup décalée à droite (écran 2)
    const features = `left=${mainWidth},top=0,width=${width},height=${height}`;
    const newWin = window.open("", "VideoScreen", features);
    if (!newWin) return;

    // Ajouter une feuille de style complète pour assurer un affichage correct
    const styleSheet = `
      <style>
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #000;
        }
        
        #video-container {
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          background: #000;
          color: #fff;
        }
        
        /* Style spécifique pour les vidéos pour s'assurer qu'elles s'affichent correctement */
        video {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain; /* Affiche la vidéo entière sans la couper */
        }
      </style>
    `;

    // Créer le HTML de base pour la fenêtre
    newWin.document.open();
    newWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Projection Vidéos</title>
          ${styleSheet}
        </head>
        <body>
          <div id="video-mount-point"></div>
        </body>
      </html>
    `);
    newWin.document.close();

    // Configurer le conteneur pour le rendu React
    containerRef.current.id = "video-container";
    
    // Attendre que le DOM soit chargé dans la nouvelle fenêtre
    setTimeout(() => {
      const mountPoint = newWin.document.getElementById('video-mount-point');
      if (mountPoint) {
        mountPoint.appendChild(containerRef.current);
        console.log("Container monté dans la fenêtre externe");
      }
    }, 100);

    setExternalWindow(newWin);

    // Ajouter un gestionnaire d'événements pour détecter le redimensionnement
    const handleResize = () => {
      console.log("Fenêtre redimensionnée:", newWin.innerWidth, "×", newWin.innerHeight);
    };
    
    newWin.addEventListener("resize", handleResize);
    
    // Log initial pour voir les dimensions
    console.log("Fenêtre créée:", newWin.innerWidth, "×", newWin.innerHeight);
    
    // cleanup à la fermeture
    return () => {
      newWin.removeEventListener("resize", handleResize);
      newWin.close();
    };
  }, [width, height]);

  // tant que la fenêtre n'est pas prête, on ne renvoie rien
  if (!externalWindow) return null;
  
  // on rend en portal tout ce qu'on entoure
  return ReactDOM.createPortal(
    <div style={{ 
      width: '100%', 
      height: '100%', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center'
    }}>
      {React.Children.map(children, child => {
        // Si c'est une vidéo, on ajoute des styles pour s'assurer qu'elle s'affiche en entier
        if (React.isValidElement(child) && (child.type === 'video' || (typeof child.type === 'string' && child.type.toLowerCase() === 'video'))) {
          const el = child as React.ReactElement<any>;
          return React.cloneElement(el, {
            style: {
              ...(el.props.style as React.CSSProperties),
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain', // Assure que la vidéo est visible en entier
              width: 'auto',
              height: 'auto',
            },
          });
        }
        return child;
      })}
    </div>,
    containerRef.current
  );
}
