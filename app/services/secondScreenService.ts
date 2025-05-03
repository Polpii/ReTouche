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
 * Ouvre ou récupère la fenêtre secondaire et l'initialise
 */
export function getSecondScreen(): Window | null {
  if (localStorage.getItem(SECOND_SCREEN_FLAG) !== 'true') {
    localStorage.setItem(SECOND_SCREEN_FLAG, 'true');
  }
  const popup = window.open(
    '',
    'mirrorFugueSecondScreen',
    'width=800,height=600'
  );
  if (!popup) return null;
  initSecondScreen(popup);
  return popup;
}

/**
 * Initialise le DOM de la fenêtre secondaire une seule fois
 */
function initSecondScreen(popup: Window): void {
  try {
    const doc = popup.document;
    if (!doc.body.hasAttribute('data-initialized')) {
      // Injecter le CSS nécessaire pour le second écran
      const style = doc.createElement('style');
      style.innerHTML = `
html, body { 
  margin: 0; 
  padding: 0; 
  width: 100%; 
  height: 100%; 
  background: black; 
  overflow: hidden; 
}

#videoContainer {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.video-wrapper {
  position: relative;
  transform-origin: 0 0;
}

video.clone {
  display: block;
  max-width: 100%;
  max-height: 100%;
}

.control-point {
  position: absolute;
  width: 16px;
  height: 16px;
  background-color: red;
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  cursor: move;
  z-index: 1000;
}

.control-handle {
  position: absolute;
  width: 100%;
  height: 100%;
  cursor: move;
  background-color: rgba(255, 255, 255, 0.1);
  opacity: 0;
  z-index: 900;
}

.perspective-outline {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 1px dashed rgba(255, 255, 255, 0.5);
  pointer-events: none;
  z-index: 999;
}
`;
      doc.head.appendChild(style);
      
      // Créer le conteneur principal
      const container = doc.createElement('div');
      container.id = 'videoContainer';
      doc.body.appendChild(container);
      
      // Variables d'état
      let videoEl: HTMLVideoElement | null = null;
      let videoWidth = 640;
      let videoHeight = 360;
      let isEditable = false;
      let currentPoints: PerspectivePoints = {
        topLeft: { x: 0, y: 0 },
        topRight: { x: videoWidth, y: 0 },
        bottomRight: { x: videoWidth, y: videoHeight },
        bottomLeft: { x: 0, y: videoHeight }
      };
      
      // Wrapper pour la vidéo
      const videoWrapper = doc.createElement('div');
      videoWrapper.className = 'video-wrapper';
      container.appendChild(videoWrapper);

      // Créer des contrôles pour chaque coin
      const controlPoints: Record<keyof PerspectivePoints, HTMLDivElement> = {
        topLeft: doc.createElement('div'),
        topRight: doc.createElement('div'),
        bottomRight: doc.createElement('div'),
        bottomLeft: doc.createElement('div')
      };
      
      // Contour pour visualiser la déformation
      const outline = doc.createElement('div');
      outline.className = 'perspective-outline';
      
      // Mise à jour des positions des points de contrôle
      function updateControlPoints() {
        if (!isEditable) {
          Object.values(controlPoints).forEach(point => {
            if (point.parentNode) point.parentNode.removeChild(point);
          });
          
          if (outline.parentNode) {
            outline.parentNode.removeChild(outline);
          }
          return;
        }
        
        // Ajouter ou réafficher les points de contrôle
        Object.entries(controlPoints).forEach(([corner, point]) => {
          point.className = 'control-point';
          point.style.left = `${currentPoints[corner as keyof PerspectivePoints].x}px`;
          point.style.top = `${currentPoints[corner as keyof PerspectivePoints].y}px`;
          
          if (!point.parentNode) {
            container.appendChild(point);
          }
        });
        
        // Ajouter le contour
        if (!outline.parentNode) {
          container.appendChild(outline);
        }
      }
      
      // Fonction pour calculer la matrice CSS
      function computeCssMatrix(srcCorners: Point[], dstCorners: Point[]): string {
        // Fonction pour résoudre un système d'équations linéaires Ax = b
        function solve(A: number[], b: number[]): number[] | null {
          const det =
            A[0] * (A[4] * A[8] - A[5] * A[7]) -
            A[1] * (A[3] * A[8] - A[5] * A[6]) +
            A[2] * (A[3] * A[7] - A[4] * A[6]);
            
          if (det === 0) return null;
          
          const invDet = 1 / det;
          const adjA = [
            A[4] * A[8] - A[5] * A[7],
            A[2] * A[7] - A[1] * A[8],
            A[1] * A[5] - A[2] * A[4],
            A[5] * A[6] - A[3] * A[8],
            A[0] * A[8] - A[2] * A[6],
            A[2] * A[3] - A[0] * A[5],
            A[3] * A[7] - A[4] * A[6],
            A[1] * A[6] - A[0] * A[7],
            A[0] * A[4] - A[1] * A[3],
          ].map((val) => val * invDet);

          return [
            adjA[0] * b[0] + adjA[1] * b[1] + adjA[2] * b[2],
            adjA[3] * b[0] + adjA[4] * b[1] + adjA[5] * b[2],
            adjA[6] * b[0] + adjA[7] * b[1] + adjA[8] * b[2],
          ];
        }

        // Calcul de la matrice adjointe
        function adj(m: number[]): number[] {
          return [
            m[4] * m[8] - m[5] * m[7],
            m[2] * m[7] - m[1] * m[8],
            m[1] * m[5] - m[2] * m[4],
            m[5] * m[6] - m[3] * m[8],
            m[0] * m[8] - m[2] * m[6],
            m[2] * m[3] - m[0] * m[5],
            m[3] * m[7] - m[4] * m[6],
            m[1] * m[6] - m[0] * m[7],
            m[0] * m[4] - m[1] * m[3],
          ];
        }

        // Multiplication de matrices
        function multmm(a: number[], b: number[]): number[] {
          const c: number[] = [];
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              let cij = 0;
              for (let k = 0; k < 3; k++) {
                cij += a[3 * i + k] * b[3 * k + j];
              }
              c[3 * i + j] = cij;
            }
          }
          return c;
        }

        // Calcul de la base à partir des points
        function basisToPoints(p1: Point, p2: Point, p3: Point, p4: Point): number[] | null {
          const m = [p1.x, p2.x, p3.x, p1.y, p2.y, p3.y, 1, 1, 1];
          const v = [p4.x, p4.y, 1];
          const s = solve(m, v);
          if (s === null) return null;
          return [
            m[0] * s[0], m[1] * s[1], m[2] * s[2],
            m[3] * s[0], m[4] * s[1], m[5] * s[2],
            m[6] * s[0], m[7] * s[1], m[8] * s[2],
          ];
        }

        // Calcul des matrices
        const m1 = basisToPoints(srcCorners[0], srcCorners[1], srcCorners[2], srcCorners[3]);
        const m2 = basisToPoints(dstCorners[0], dstCorners[1], dstCorners[2], dstCorners[3]);
        
        if (!m1 || !m2) return '';
        
        const m3 = multmm(m2, adj(m1));
        for (let i = 0; i < m3.length; i++) {
          m3[i] /= m3[8];
        }

        // Construction de la matrice CSS 3D
        const matrix3d = [
          m3[0], m3[3], 0, m3[6],
          m3[1], m3[4], 0, m3[7],
          0, 0, 1, 0,
          m3[2], m3[5], 0, m3[8],
        ];

        return `matrix3d(${matrix3d.join(',')})`;
      }
      
      // Mise à jour de la transformation
      function applyPerspectiveTransform() {
        if (!videoEl) return;
        
        // Points source - les dimensions originales du rectangle
        const srcPoints = [
          { x: 0, y: 0 },                   // topLeft
          { x: videoWidth, y: 0 },          // topRight
          { x: videoWidth, y: videoHeight }, // bottomRight
          { x: 0, y: videoHeight }           // bottomLeft
        ];
        
        // Points de destination - où chaque coin doit aller
        const dstPoints = [
          currentPoints.topLeft,
          currentPoints.topRight,
          currentPoints.bottomRight,
          currentPoints.bottomLeft
        ];
        
        // Calculer et appliquer la matrice de transformation
        const matrix = computeCssMatrix(srcPoints, dstPoints);
        videoWrapper.style.transform = matrix;
      }
      
      // Configuration des listeners pour les points de contrôle
      Object.entries(controlPoints).forEach(([corner, point]) => {
        point.onmousedown = function(e) {
          e.preventDefault();
          e.stopPropagation();
          
          const startX = e.clientX;
          const startY = e.clientY;
          const startPoint = { ...currentPoints[corner as keyof PerspectivePoints] };
          
          function onMouseMove(moveEvt: MouseEvent) {
            // Calculer les nouvelles coordonnées
            const newX = startPoint.x + (moveEvt.clientX - startX);
            const newY = startPoint.y + (moveEvt.clientY - startY);
            
            // Mettre à jour la position du point
            point.style.left = `${newX}px`;
            point.style.top = `${newY}px`;
            
            // Mettre à jour l'état
            currentPoints[corner as keyof PerspectivePoints] = { x: newX, y: newY };
            
            // Appliquer la transformation
            applyPerspectiveTransform();
            
            // Notifier la fenêtre parente
            if (window.opener) {
              window.opener.postMessage({
                type: 'perspectivePointsChanged',
                points: currentPoints
              }, '*');
            }
          }
          
          function onMouseUp() {
            doc.removeEventListener('mousemove', onMouseMove);
            doc.removeEventListener('mouseup', onMouseUp);
          }
          
          doc.addEventListener('mousemove', onMouseMove);
          doc.addEventListener('mouseup', onMouseUp);
        };
      });
      
      // Ajout d'un gestionnaire pour le déplacement groupé
      const handleGroupDrag = (e: MouseEvent) => {
        if (!isEditable) return;
        
        // Ignorer si on clique sur un point de contrôle
        if ((e.target as Element).classList.contains('control-point')) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const startX = e.clientX;
        const startY = e.clientY;
        // Faire une copie profonde des points actuels
        const startPoints = JSON.parse(JSON.stringify(currentPoints));
        
        function onMouseMove(moveEvt: MouseEvent) {
          const deltaX = moveEvt.clientX - startX;
          const deltaY = moveEvt.clientY - startY;
          
          // Mettre à jour tous les points
          Object.keys(currentPoints).forEach(key => {
            const k = key as keyof PerspectivePoints;
            currentPoints[k] = {
              x: startPoints[k].x + deltaX,
              y: startPoints[k].y + deltaY
            };
            
            // Mettre à jour la position visuelle du point de contrôle
            controlPoints[k].style.left = `${currentPoints[k].x}px`;
            controlPoints[k].style.top = `${currentPoints[k].y}px`;
          });
          
          // Appliquer la transformation
          applyPerspectiveTransform();
          
          // Notifier la fenêtre parente
          if (window.opener) {
            window.opener.postMessage({
              type: 'perspectivePointsChanged',
              points: currentPoints
            }, '*');
          }
        }
        
        function onMouseUp() {
          doc.removeEventListener('mousemove', onMouseMove);
          doc.removeEventListener('mouseup', onMouseUp);
        }
        
        doc.addEventListener('mousemove', onMouseMove);
        doc.addEventListener('mouseup', onMouseUp);
      };
      
      // Ajouter le gesture pour déplacer l'ensemble
      container.onmousedown = handleGroupDrag;
      
      // Fonction receiveVideo exposée à la fenêtre principale
      (popup as any).receiveVideo = function(newVideoEl: HTMLVideoElement | null, cfg?: TransformConfig) {
        // Nettoyer la vidéo existante
        while (videoWrapper.firstChild) {
          videoWrapper.removeChild(videoWrapper.firstChild);
        }
        
        // Si pas de vidéo, on cache tout
        if (!newVideoEl) {
          videoEl = null;
          isEditable = false;
          updateControlPoints();
          return;
        }
        
        // Configurer la nouvelle vidéo
        videoEl = newVideoEl;
        videoEl.classList.add('clone');
        videoWrapper.appendChild(videoEl);
        
        // Appliquer les configurations si fournies
        if (cfg) {
          isEditable = !!cfg.editable;
          
          if (cfg.baseWidth && cfg.baseHeight) {
            videoWidth = cfg.baseWidth;
            videoHeight = cfg.baseHeight;
            videoEl.style.width = `${videoWidth}px`;
            videoEl.style.height = `${videoHeight}px`;
          } else {
            // Par défaut
            videoWidth = 640;
            videoHeight = 360;
          }
          
          // Appliquer le décalage vidéo s'il existe
          if (cfg.videoOffset) {
            videoEl.style.position = 'relative';
            videoEl.style.left = `-${cfg.videoOffset.x}px`;
            videoEl.style.top = `-${cfg.videoOffset.y}px`;
          }
          
          // Utiliser les points fournis ou des points par défaut
          if (cfg.perspectivePoints) {
            currentPoints = cfg.perspectivePoints;
          } else {
            // Points par défaut aux quatre coins
            currentPoints = {
              topLeft: { x: 0, y: 0 },
              topRight: { x: videoWidth, y: 0 },
              bottomRight: { x: videoWidth, y: videoHeight },
              bottomLeft: { x: 0, y: videoHeight }
            };
          }

          // Ajouter la poignée de déplacement
          const handle = doc.createElement('div');
          handle.className = 'control-handle';
          videoWrapper.appendChild(handle);
          
          // Mettre à jour la transformation et les contrôles
          applyPerspectiveTransform();
          updateControlPoints();
        }
      };
      
      doc.body.setAttribute('data-initialized', 'true');
    }
  } catch (err) {
    console.error('[SecondScreen] init error:', err);
  }
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

  let clone: HTMLVideoElement;
  try {
    clone = popup.document.createElement('video');
    clone.src = videoElement.src;
    clone.muted = videoElement.muted;
    clone.playsInline = true;
    clone.controls = false;
    clone.currentTime = videoElement.currentTime;
    clone.playbackRate = videoElement.playbackRate;
    if (!videoElement.paused) clone.play().catch(() => {});
  } catch (err) {
    console.error('[SecondScreen] clone error:', err);
    return null;
  }
  
  // Ajouter les écouteurs d'événements pour la synchronisation
  const onPlay = () => clone.play().catch(() => {});
  const onPause = () => clone.pause();
  const onSeek = () => { clone.currentTime = videoElement!.currentTime; };
  const onRate = () => { clone.playbackRate = videoElement!.playbackRate; };
  
  videoElement.addEventListener('play', onPlay);
  videoElement.addEventListener('pause', onPause);
  videoElement.addEventListener('seeked', onSeek);
  videoElement.addEventListener('ratechange', onRate);
  
  // Envoyer la vidéo à la fenêtre secondaire avec sa configuration
  (popup as any).receiveVideo(clone, transformConfig);
  
  return clone;
}

/**
 * Configure l'écouteur d'événements pour capter les changements de perspective depuis le second écran
 */
export function setupPerspectiveChangeListener(onPointsChange: (points: PerspectivePoints) => void): () => void {
  const messageHandler = (event: MessageEvent) => {
    if (event.data && event.data.type === 'perspectivePointsChanged') {
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

// Nettoyage automatique à la fermeture de la page
window.addEventListener('beforeunload', () => {
  closeSecondScreen();
});
