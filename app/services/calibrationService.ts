import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const CALIBRATION_COLLECTION = "calibrations";

export interface CalibrationConfig {
  normalizedCrop: { 
    x: number; 
    y: number; 
    width: number; 
    height: number 
  };
  normalizedPoints: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
  };
  normalizedVideoOffset: { 
    x: number; 
    y: number 
  };
  baseWidth: number;
  baseHeight: number;
}

/**
 * Saves calibration configuration to Firestore
 */
export async function saveCalibrationConfig(configId: string, config: CalibrationConfig): Promise<void> {
  const docRef = doc(db, CALIBRATION_COLLECTION, configId);
  await setDoc(docRef, config);
  
  // Also save to localStorage as fallback
  try {
    localStorage.setItem(configId, JSON.stringify(config));
  } catch (error) {
    console.warn("Failed to save to localStorage:", error);
  }
}

/**
 * Gets calibration configuration from Firestore
 */
export async function getCalibrationConfig(configId: string): Promise<CalibrationConfig | null> {
  try {
    const docRef = doc(db, CALIBRATION_COLLECTION, configId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as CalibrationConfig;
    }
    
    // Try from localStorage as fallback
    const localData = localStorage.getItem(configId);
    if (localData) {
      return JSON.parse(localData);
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching calibration config:", error);
    
    // Try from localStorage as ultimate fallback
    try {
      const localData = localStorage.getItem(configId);
      if (localData) {
        return JSON.parse(localData);
      }
    } catch (e) {
      console.error("Error reading from localStorage:", e);
    }
    
    return null;
  }
}

/**
 * Saves position and transform points configuration
 */
export async function savePositionConfig(userId: string, soundId: string, config: {
  position: { x: number; y: number };
  perspectivePoints: any;
}): Promise<void> {
  const configId = `position_${userId}_${soundId}`;
  const docRef = doc(db, "positions", configId);
  await setDoc(docRef, config);
  
  // Also save to localStorage as fallback
  try {
    localStorage.setItem(`recordedVideoContainerPos_${soundId}`, JSON.stringify(config.position));
    localStorage.setItem(`recordedVideoPerspectivePoints_${soundId}`, JSON.stringify(config.perspectivePoints));
  } catch (error) {
    console.warn("Failed to save position to localStorage:", error);
  }
}

/**
 * Gets position configuration
 */
export async function getPositionConfig(userId: string, soundId: string): Promise<{
  position: { x: number; y: number };
  perspectivePoints: any;
} | null> {
  try {
    const configId = `position_${userId}_${soundId}`;
    const docRef = doc(db, "positions", configId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as { position: { x: number; y: number }; perspectivePoints: any };
    }
    
    // Try from localStorage as fallback
    const positionData = localStorage.getItem(`recordedVideoContainerPos_${soundId}`);
    const pointsData = localStorage.getItem(`recordedVideoPerspectivePoints_${soundId}`);
    
    if (positionData && pointsData) {
      return {
        position: JSON.parse(positionData),
        perspectivePoints: JSON.parse(pointsData)
      };
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching position config:", error);
    return null;
  }
}
