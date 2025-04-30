// Étendre l'interface Window pour inclure notre fonction receiveVideo

// Définition des types nécessaires directement dans ce fichier
interface Point {
  x: number;
  y: number;
}

interface PerspectivePoints {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

interface VideoTransformConfig {
  perspectivePoints?: PerspectivePoints;
  position?: { x: number; y: number };
  videoOffset?: { x: number; y: number };
  crop?: { x: number; y: number; width: number; height: number };
  baseWidth?: number;
  baseHeight?: number;
}

interface Window {
  /**
   * Fonction personnalisée pour recevoir et afficher une vidéo sur le second écran
   * @param videoElement Élément vidéo à afficher (ou null pour vider l'affichage)
   * @param transformConfig Configuration optionnelle pour la transformation de la vidéo
   */
  receiveVideo: (videoElement: HTMLVideoElement | null, transformConfig?: VideoTransformConfig) => void;
}