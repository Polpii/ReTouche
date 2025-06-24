"use client";
export const dynamic = "force-dynamic";

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSoundContext, Sound, Annotation } from '../../context/SoundContext';
import Link from 'next/link';

function EditorPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const soundId = searchParams.get("soundId");
  const { sounds, loading, updateSound } = useSoundContext();

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Verify that the sound exists
    if (soundId && !loading) {
      const sound = sounds.find(s => s.id === soundId);
      if (!sound) {
        setErrorMessage(`Sound with ID ${soundId} not found`);
        // Redirect to a safe page after a delay
        setTimeout(() => router.push("/teacher_admin/sounds"), 3000);
      } else {
        // Initialize annotations from the sound data, or empty array if none exist
        setAnnotations(sound.annotations || []);
      }
    }
  }, [soundId, sounds, loading, router]);

  const handleSaveAnnotations = async () => {
    try {
      setIsSaving(true);

      const soundToUpdate = sounds.find(s => s.id === soundId);
      if (!soundToUpdate) {
        throw new Error("Sound not found");
      }

      console.log("Updating sound with ID:", soundToUpdate.id);

      const updatedSound: Sound = {
        ...soundToUpdate,
        annotations: annotations.map(a => ({
          ...a,
          id: a.id || `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: a.timestamp || 0,
          color: a.color || "purple"
        }))
      };

      await updateSound(updatedSound);

      setSuccessMessage("Annotations saved successfully");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error saving annotations:", error);
      setErrorMessage("Error updating sound: " + (error instanceof Error ? error.message : String(error)));
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!soundId || !sounds.find(s => s.id === soundId)) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Error</h1>
        <p className="text-red-600">
          {errorMessage || "Sound not found"}
        </p>
        <div className="mt-4">
          <Link href="/teacher_admin/sounds" className="px-4 py-2 bg-blue-500 text-white rounded">
            Back to Sounds
          </Link>
        </div>
      </div>
    );
  }

  const sound = sounds.find(s => s.id === soundId)!;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Editor: {sound.title}</h1>
      
      {successMessage && <p className="mb-4 p-2 bg-green-100 text-green-700 rounded">{successMessage}</p>}
      {errorMessage && <p className="mb-4 p-2 bg-red-100 text-red-700 rounded">{errorMessage}</p>}
      
      <div className="mb-4">
        <button 
          onClick={handleSaveAnnotations} 
          disabled={isSaving}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
        >
          {isSaving ? "Saving..." : "Save Annotations"}
        </button>
      </div>
      
      <div className="mb-4">
        <h2 className="text-xl mb-2">Video Preview</h2>
        {sound.videoUrl && (
          <video 
            src={sound.videoUrl}
            controls
            className="w-full max-h-96 object-contain bg-black"
          />
        )}
      </div>
      
      <div className="mb-4">
        <Link href="/teacher_admin/sounds" className="text-blue-500 hover:underline">
          Back to Sounds
        </Link>
      </div>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<p>Chargement…</p>}>
      <EditorPageInner />
    </Suspense>
  );
}