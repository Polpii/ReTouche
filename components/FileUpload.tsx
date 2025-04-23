"use client";
import React, { useRef, useState } from 'react';
import { uploadFile } from '../app/services/mediaService';

interface FileUploadProps {
  onFileUploaded: (url: string) => void;
  accept?: string;
  folder: string;
  label: string;
  className?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileUploaded, 
  accept = '*/*',
  folder,
  label,
  className = ''
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);
      
      // Create a unique filename with timestamp
      const timestamp = new Date().getTime();
      const fileName = `${timestamp}_${file.name}`;
      
      // Read the file as a blob
      const fileBlob = new Blob([file], { type: file.type });
      
      // Upload to Firebase
      const downloadUrl = await uploadFile(folder, fileName, fileBlob, file.type);
      
      // Call the callback with the URL
      onFileUploaded(downloadUrl);
      
      // Clear the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={className}>
      <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
        {label}
        <input
          ref={fileInputRef}
          type="file"
          className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 mt-1"
          accept={accept}
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>
      {uploading && <p className="text-sm text-blue-600">Uploading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default FileUpload;
