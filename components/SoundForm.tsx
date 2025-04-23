"use client";
import React, { useState } from 'react';
import { Sound, Section } from '../app/context/SoundContext';
import FileUpload from './FileUpload';

interface SoundFormProps {
  initialSound?: Sound;
  onSubmit: (sound: Omit<Sound, 'id'>) => Promise<void>;
  onCancel: () => void;
}

const SoundForm: React.FC<SoundFormProps> = ({ initialSound, onSubmit, onCancel }) => {
  const [title, setTitle] = useState(initialSound?.title || '');
  const [videoUrl, setVideoUrl] = useState(initialSound?.videoUrl || '');
  const [audioUrl, setAudioUrl] = useState(initialSound?.audioUrl || '');
  const [midiUrl, setMidiUrl] = useState(initialSound?.midiUrl || '');
  const [sections, setSections] = useState<Section[]>(initialSound?.sections || []);
  
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Track if we need to add a new section
  const [newSectionStart, setNewSectionStart] = useState<string>('');
  const [newSectionEnd, setNewSectionEnd] = useState<string>('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title || !videoUrl) {
      setError('Title and video are required');
      return;
    }
    
    try {
      setSubmitting(true);
      setError(null);
      
      const soundData: Omit<Sound, 'id'> = {
        title,
        videoUrl,
        audioUrl,
        midiUrl,
        sections
      };
      
      await onSubmit(soundData);
    } catch (err) {
      console.error('Error submitting sound:', err);
      setError('Failed to save sound');
    } finally {
      setSubmitting(false);
    }
  };
  
  const addSection = () => {
    if (!newSectionStart || !newSectionEnd) {
      return;
    }
    
    const start = parseFloat(newSectionStart);
    const end = parseFloat(newSectionEnd);
    
    if (isNaN(start) || isNaN(end)) {
      setError('Section start and end must be valid numbers');
      return;
    }
    
    if (start >= end) {
      setError('Section end time must be greater than start time');
      return;
    }
    
    const newSection: Section = {
      id: `section_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      start,
      end
    };
    
    setSections([...sections, newSection]);
    setNewSectionStart('');
    setNewSectionEnd('');
    setError(null);
  };
  
  const removeSection = (id: string) => {
    setSections(sections.filter(s => s.id !== id));
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-white rounded shadow">
      <div>
        <label className="block mb-1 text-sm font-medium text-gray-900">
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="block w-full mt-1 p-2 border border-gray-300 rounded"
            required
          />
        </label>
      </div>
      
      <FileUpload
        label="Video"
        folder="videos"
        accept="video/*"
        onFileUploaded={setVideoUrl}
      />
      {videoUrl && <p className="text-sm text-green-600">Video uploaded successfully</p>}
      
      <FileUpload
        label="Audio (optional)"
        folder="audio"
        accept="audio/*"
        onFileUploaded={setAudioUrl}
      />
      {audioUrl && <p className="text-sm text-green-600">Audio uploaded successfully</p>}
      
      <FileUpload
        label="MIDI File (optional)"
        folder="midi"
        accept=".mid,.midi"
        onFileUploaded={setMidiUrl}
      />
      {midiUrl && <p className="text-sm text-green-600">MIDI file uploaded successfully</p>}
      
      <div className="border-t border-gray-200 pt-4">
        <h3 className="font-medium mb-2">Sections</h3>
        
        <div className="space-y-2">
          {sections.map((section) => (
            <div key={section.id} className="flex items-center space-x-2">
              <span>Start: {section.start}s</span>
              <span>End: {section.end}s</span>
              <button
                type="button"
                onClick={() => removeSection(section.id)}
                className="px-2 py-1 text-xs text-red-600 hover:bg-red-100 rounded"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        
        <div className="flex items-end space-x-2 mt-2">
          <label className="block">
            <span className="text-sm">Start Time (s)</span>
            <input
              type="number"
              step="0.1"
              value={newSectionStart}
              onChange={(e) => setNewSectionStart(e.target.value)}
              className="block w-24 p-2 border border-gray-300 rounded"
            />
          </label>
          
          <label className="block">
            <span className="text-sm">End Time (s)</span>
            <input
              type="number"
              step="0.1"
              value={newSectionEnd}
              onChange={(e) => setNewSectionEnd(e.target.value)}
              className="block w-24 p-2 border border-gray-300 rounded"
            />
          </label>
          
          <button
            type="button"
            onClick={addSection}
            className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Add Section
          </button>
        </div>
      </div>
      
      {error && <p className="text-red-600">{error}</p>}
      
      <div className="flex justify-end space-x-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100"
          disabled={submitting}
        >
          Cancel
        </button>
        
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          disabled={submitting}
        >
          {submitting ? 'Saving...' : initialSound ? 'Update Sound' : 'Add Sound'}
        </button>
      </div>
    </form>
  );
};

export default SoundForm;
