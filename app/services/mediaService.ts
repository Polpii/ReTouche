import { storage } from "./firebase";
import { ref, uploadString, getDownloadURL, uploadBytes, deleteObject } from "firebase/storage";
import { db } from "./firebase";
import { 
  collection, addDoc, doc, updateDoc, getDoc, arrayUnion, 
  getDocs, setDoc, deleteDoc
} from "firebase/firestore";
import { Sound } from "../context/SoundContext";

/**
 * Uploads a video to Firebase Storage
 */
export async function uploadVideo(filename: string, base64Data: string): Promise<string> {
  try {
    // Remove the data URL prefix if present
    const base64Content = base64Data.includes('base64,') 
      ? base64Data.split('base64,')[1] 
      : base64Data;
    
    const storageRef = ref(storage, `videos/${filename}`);
    await uploadString(storageRef, base64Content, 'base64');
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (error) {
    console.error("Error uploading video:", error);
    throw error;
  }
}

/**
 * Uploads MIDI data to Firebase Storage
 */
export async function uploadMidiData(filename: string, midiData: any[]): Promise<string> {
  try {
    const storageRef = ref(storage, `midi/${filename}`);
    await uploadString(storageRef, JSON.stringify(midiData), 'raw');
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (error) {
    console.error("Error uploading MIDI data:", error);
    throw error;
  }
}

/**
 * Uploads an audio file to Firebase Storage
 */
export async function uploadAudio(filename: string, blob: Blob): Promise<string> {
  try {
    const storageRef = ref(storage, `audio/${filename}`);
    await uploadBytes(storageRef, blob);
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (error) {
    console.error("Error uploading audio:", error);
    throw error;
  }
}

/**
 * Uploads any file to Firebase Storage with specified path
 */
export async function uploadFile(path: string, filename: string, data: Blob | string, contentType?: string): Promise<string> {
  try {
    const storageRef = ref(storage, `${path}/${filename}`);
    
    if (typeof data === 'string') {
      // Check if it's base64 data
      if (data.includes('base64,')) {
        const base64Content = data.split('base64,')[1];
        await uploadString(storageRef, base64Content, 'base64');
      } else {
        await uploadString(storageRef, data, 'raw');
      }
    } else {
      // It's a Blob
      await uploadBytes(storageRef, data, contentType ? { contentType } : undefined);
    }
    
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

/**
 * Delete a file from Firebase Storage
 */
export async function deleteFile(url: string): Promise<void> {
  try {
    // Check for valid URL
    if (!url || typeof url !== 'string') {
      console.warn("Invalid URL provided to deleteFile:", url);
      return;
    }

    // Parse the Firebase Storage URL to get the path
    let path;
    if (url.includes('firebasestorage.googleapis.com')) {
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        // Extract path after '/o/'
        const parts = pathname.split('/o/');
        if (parts.length >= 2) {
          path = decodeURIComponent(parts[1]);
          console.log("Extracted path:", path);
        } else {
          throw new Error("Could not extract file path from URL");
        }
      } catch (err) {
        console.error("Error parsing storage URL:", err);
        throw err;
      }
    } else {
      // If it's a direct path
      path = url;
    }

    if (!path) {
      throw new Error("Could not determine file path from URL");
    }

    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
    console.log(`Successfully deleted file at path: ${path}`);
  } catch (error) {
    console.error("Error deleting file:", error);
    throw error;
  }
}

/**
 * Sound Collection Methods
 */
const SOUNDS_COLLECTION = "sounds";

/**
 * Get all sounds from Firestore
 */
export async function getAllSounds(): Promise<Sound[]> {
  try {
    const soundsRef = collection(db, SOUNDS_COLLECTION);
    const snapshot = await getDocs(soundsRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Sound);
  } catch (error) {
    console.error("Error getting sounds:", error);
    throw error;
  }
}

/**
 * Add a new sound to Firestore
 */
export async function addSound(sound: Omit<Sound, 'id'>): Promise<Sound> {
  try {
    const soundRef = collection(db, SOUNDS_COLLECTION);
    const docRef = await addDoc(soundRef, sound);
    const newSound = { id: docRef.id, ...sound };
    console.log(`Successfully added sound with ID: ${docRef.id}`);
    return newSound;
  } catch (error) {
    console.error("Error adding sound:", error);
    throw error;
  }
}

/**
 * Update a sound in Firestore
 */
export async function updateSound(sound: Sound): Promise<void> {
  try {
    if (!sound || !sound.id) {
      throw new Error("Invalid sound data: Missing ID");
    }
    const soundData = JSON.parse(JSON.stringify({
      title: sound.title,
      audioUrl: sound.audioUrl || '',
      videoUrl: sound.videoUrl || '',
      midiUrl: sound.midiUrl || '',
      sections: sound.sections || [],
      annotations: sound.annotations || [],
      calibration: sound.calibration || null,
    }));
    const soundRef = doc(db, SOUNDS_COLLECTION, sound.id);
    const soundDoc = await getDoc(soundRef);
    if (!soundDoc.exists()) {
      // Upsert: Create the document when it doesn't exist
      console.warn(`Document with ID ${sound.id} not found. Creating it instead.`);
      await setDoc(soundRef, {
        ...soundData,
        id: sound.id,
        createdAt: new Date().toISOString()
      });
      console.log(`Successfully created sound with ID: ${sound.id}`);
    } else {
      await updateDoc(soundRef, soundData);
      console.log(`Successfully updated sound with ID: ${sound.id}`);
    }
  } catch (error) {
    console.error("Error updating sound:", error);
    throw error;
  }
}

/**
 * Delete a sound from Firestore and its related files from Storage
 */
export async function deleteSound(sound: Sound): Promise<void> {
  try {
    if (!sound || !sound.id) {
      throw new Error("Invalid sound data: Missing ID");
    }
    
    // Delete files from storage - only if URLs exist and are Firebase URLs
    if (sound.videoUrl && sound.videoUrl.includes('firebasestorage')) {
      try {
        await deleteFile(sound.videoUrl);
      } catch (err) {
        console.error("Failed to delete video:", err);
      }
    }
    
    if (sound.audioUrl && sound.audioUrl.includes('firebasestorage')) {
      try {
        await deleteFile(sound.audioUrl);
      } catch (err) {
        console.error("Failed to delete audio:", err);
      }
    }
    
    if (sound.midiUrl && sound.midiUrl.includes('firebasestorage')) {
      try {
        await deleteFile(sound.midiUrl);
      } catch (err) {
        console.error("Failed to delete MIDI:", err);
      }
    }

    // Delete document from Firestore
    const soundRef = doc(db, SOUNDS_COLLECTION, sound.id);
    await deleteDoc(soundRef);
    console.log(`Successfully deleted sound with ID: ${sound.id}`);
  } catch (error) {
    console.error("Error deleting sound:", error);
    throw error;
  }
}

/**
 * Delete a sound from Firestore without deleting related files from Storage
 */
export async function deleteSoundWithoutFiles(sound: Sound): Promise<void> {
  try {
    if (!sound || !sound.id) {
      throw new Error("Invalid sound data: Missing ID");
    }
    
    // Delete document from Firestore only
    const soundRef = doc(db, SOUNDS_COLLECTION, sound.id);
    await deleteDoc(soundRef);
    console.log(`Successfully deleted sound with ID: ${sound.id} (files preserved)`);
  } catch (error) {
    console.error("Error deleting sound:", error);
    throw error;
  }
}

/**
 * Learner Management Methods
 */

/**
 * Adds a recording to a learner's profile
 */
export async function addRecordingToLearner(
  learnerName: string, 
  recordingData: {
    name: string;
    videoUrl: string;
    midiUrl?: string;
    notes?: string;
  }
): Promise<void> {
  try {
    const learnerDocRef = doc(db, "learners", learnerName);
    const learnerDoc = await getDoc(learnerDocRef);
    
    if (learnerDoc.exists()) {
      // Add recording to the existing array
      await updateDoc(learnerDocRef, {
        recordings: arrayUnion(recordingData)
      });
    } else {
      // Create the learner with the recording
      await setDoc(learnerDocRef, {
        name: learnerName,
        recordings: [recordingData]
      });
    }
    console.log(`Successfully added recording to learner ${learnerName}`);
  } catch (error) {
    console.error("Error adding recording to learner:", error);
    throw error;
  }
}

/**
 * Deletes a recording from a learner's profile and removes files from storage
 */
export async function deleteRecordingFromLearner(
  learnerName: string,
  recordingName: string
): Promise<void> {
  try {
    const learnerDocRef = doc(db, "learners", learnerName);
    
    // Get current recordings
    const learnerDoc = await getDoc(learnerDocRef);
    if (learnerDoc.exists()) {
      const learnerData = learnerDoc.data();
      const recordings = learnerData.recordings || [];
      
      // Find the recording to delete its files
      const recordingToDelete = recordings.find((rec: any) => rec.name === recordingName);
      if (recordingToDelete) {
        // Delete the files from storage
        if (recordingToDelete.videoUrl) {
          await deleteFile(recordingToDelete.videoUrl).catch(err => console.error("Failed to delete video:", err));
        }
        if (recordingToDelete.midiUrl) {
          await deleteFile(recordingToDelete.midiUrl).catch(err => console.error("Failed to delete MIDI:", err));
        }
      }
      
      // Filter out the recording from the learner data
      const updatedRecordings = recordings.filter(
        (rec: any) => rec.name !== recordingName
      );
      
      // Update the learner doc
      await updateDoc(learnerDocRef, {
        recordings: updatedRecordings
      });
      
      console.log(`Successfully deleted recording ${recordingName} from learner ${learnerName}`);
    }
  } catch (error) {
    console.error("Error deleting recording:", error);
    throw error;
  }
}

/**
 * Gets all learners from Firestore
 */
export async function getAllLearners(): Promise<any[]> {
  try {
    const learnersRef = collection(db, "learners");
    const snapshot = await getDocs(learnersRef);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error("Error getting learners:", error);
    throw error;
  }
}

/**
 * Adds a new learner to Firestore
 */
export async function addLearner(learnerData: any): Promise<any> {
  try {
    const learnerRef = doc(db, "learners", learnerData.name);
    await setDoc(learnerRef, learnerData);
    return learnerData;
  } catch (error) {
    console.error("Error adding learner:", error);
    throw error;
  }
}

/**
 * Updates a learner in Firestore
 */
export async function updateLearner(learnerData: any): Promise<any> {
  try {
    const learnerRef = doc(db, "learners", learnerData.name);
    await updateDoc(learnerRef, learnerData);
    return learnerData;
  } catch (error) {
    console.error("Error updating learner:", error);
    throw error;
  }
}
