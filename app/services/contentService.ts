import { storage } from "./firebase";
import { ref, getDownloadURL, listAll } from "firebase/storage";
import React, { useState, useEffect } from 'react';

/**
 * Get a file URL from Firebase Storage content folder
 */
export async function getContentUrl(path: string): Promise<string> {
  try {
    const contentRef = ref(storage, `content/${path}`);
    const downloadUrl = await getDownloadURL(contentRef);
    return downloadUrl;
  } catch (error) {
    console.error(`Error getting content URL for ${path}:`, error);
    throw error;
  }
}

/**
 * List all content in a directory
 */
export async function listContentFiles(directory: string): Promise<string[]> {
  try {
    const directoryRef = ref(storage, `content/${directory}`);
    const fileList = await listAll(directoryRef);
    return fileList.items.map(item => item.name);
  } catch (error) {
    console.error(`Error listing content in ${directory}:`, error);
    throw error;
  }
}

/**
 * A hook to use Firebase Storage content in React components
 */
export function useFirebaseContent(path: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadContent() {
      try {
        setLoading(true);
        const contentUrl = await getContentUrl(path);
        setUrl(contentUrl);
        setError(null);
      } catch (err) {
        console.error(`Failed to load content: ${path}`, err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    loadContent();
  }, [path]);

  return { url, loading, error };
}
