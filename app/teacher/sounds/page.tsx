"use client";
import React from 'react';
import { useSoundContext } from '../../context/SoundContext';
import Link from 'next/link';

export default function TeacherSoundsPage() {
  const { sounds, loading, error } = useSoundContext();
  
  if (loading) {
    return <div className="p-4">Loading sounds...</div>;
  }
  
  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>;
  }
  
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Teacher Sound Management</h1>
      
      <div className="mb-4">
        <Link 
          href="/admin/sounds" 
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 inline-block"
        >
          Manage Sounds
        </Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sounds.length === 0 ? (
          <p>No sounds available. Add sounds in the Admin panel.</p>
        ) : (
          sounds.map((sound) => (
            <div key={sound.id} className="p-4 border rounded shadow bg-white">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-medium">{sound.title}</h3>
              </div>
              
              {sound.videoUrl && (
                <div className="mt-2">
                  <video
                    src={sound.videoUrl}
                    controls
                    className="w-full h-40 object-cover"
                  />
                </div>
              )}
              
              <div className="mt-4 flex justify-between">
                <Link 
                  href={`/teacher/editor?soundId=${sound.id}`}
                  className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                >
                  Edit Annotations
                </Link>
                
                <Link 
                  href={`/teacher/play?soundId=${sound.id}`}
                  className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                >
                  Play
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
