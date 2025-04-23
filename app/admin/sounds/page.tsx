"use client";
import React, { useState } from 'react';
import { useSoundContext, Sound } from '../../context/SoundContext';
import SoundForm from '../../../components/SoundForm';

export default function SoundManagementPage() {
  const { sounds, loading, error, addSound, updateSound, deleteSound } = useSoundContext();
  const [isAddingSound, setIsAddingSound] = useState(false);
  const [editingSound, setEditingSound] = useState<Sound | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  const handleAddSound = async (soundData: Omit<Sound, 'id'>) => {
    try {
      await addSound(soundData);
      setIsAddingSound(false);
    } catch (err) {
      console.error("Error adding sound:", err);
      alert("Failed to add sound. Please try again.");
    }
  };
  
  const handleUpdateSound = async (soundData: Omit<Sound, 'id'>) => {
    if (!editingSound) return;
    
    try {
      await updateSound({
        ...soundData,
        id: editingSound.id,
      });
      setEditingSound(null);
    } catch (err) {
      console.error("Error updating sound:", err);
      alert("Failed to update sound. Please try again.");
    }
  };
  
  const handleDeleteSound = async (sound: Sound) => {
    try {
      setDeleteError(null);
      if (confirm(`Are you sure you want to delete "${sound.title}"?`)) {
        await deleteSound(sound);
      }
    } catch (err) {
      console.error("Error deleting sound:", err);
      setDeleteError(`Failed to delete sound: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  
  const formatDuration = (duration: number) => {
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  if (loading) {
    return <div className="p-4">Loading sounds...</div>;
  }
  
  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>;
  }
  
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Sound Management</h1>
      
      {deleteError && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {deleteError}
        </div>
      )}
      
      {isAddingSound ? (
        <div className="mb-8">
          <h2 className="text-xl mb-2">Add New Sound</h2>
          <SoundForm 
            onSubmit={handleAddSound} 
            onCancel={() => setIsAddingSound(false)} 
          />
        </div>
      ) : editingSound ? (
        <div className="mb-8">
          <h2 className="text-xl mb-2">Edit Sound</h2>
          <SoundForm 
            initialSound={editingSound} 
            onSubmit={handleUpdateSound} 
            onCancel={() => setEditingSound(null)} 
          />
        </div>
      ) : (
        <button
          onClick={() => setIsAddingSound(true)}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 mb-4"
        >
          Add New Sound
        </button>
      )}
      
      <div className="grid grid-cols-1 gap-4">
        {sounds.length === 0 ? (
          <p>No sounds available. Add a new sound to get started.</p>
        ) : (
          sounds.map((sound) => (
            <div key={sound.id} className="p-4 border rounded shadow bg-white">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-medium">{sound.title}</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setEditingSound(sound)}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteSound(sound)}
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
              
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                {sound.videoUrl && (
                  <div>
                    <h4 className="text-sm font-medium">Video Preview</h4>
                    <video
                      src={sound.videoUrl}
                      controls
                      className="mt-1 w-full max-h-48 object-contain"
                    />
                  </div>
                )}
                {sound.audioUrl && (
                  <div>
                    <h4 className="text-sm font-medium">Audio</h4>
                    <audio
                      src={sound.audioUrl}
                      controls
                      className="mt-1 w-full"
                    />
                  </div>
                )}
              </div>
              
              {sound.sections && sound.sections.length > 0 && (
                <div className="mt-2">
                  <h4 className="text-sm font-medium">Sections</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                    {sound.sections.map((section) => (
                      <div key={section.id} className="text-sm bg-gray-100 p-2 rounded">
                        {formatDuration(section.start)} - {formatDuration(section.end)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {sound.midiUrl && (
                <div className="mt-2 text-sm">
                  <span className="font-medium">MIDI File:</span> Available
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
