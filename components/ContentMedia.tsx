"use client";
import React, { useState, useEffect } from 'react';
import { getContentUrl } from '../app/services/contentService';

interface ContentMediaProps {
  path: string;
  type: 'video' | 'audio' | 'image';
  fallback?: string;
  className?: string;
  style?: React.CSSProperties;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  onLoadedData?: () => void;
  onError?: (error: Error) => void;
  [key: string]: any; // For other props
}

const ContentMedia: React.FC<ContentMediaProps> = ({
  path,
  type,
  fallback,
  className = '',
  style = {},
  onLoadedData,
  onError,
  ...props
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    async function loadContent() {
      try {
        setLoading(true);
        
        // Handle both Firebase URLs and relative paths
        let contentUrl;
        if (path.startsWith('http')) {
          contentUrl = path;
        } else {
          contentUrl = await getContentUrl(path);
        }
        
        if (isMounted) {
          setUrl(contentUrl);
          setError(null);
        }
      } catch (err) {
        console.error(`Failed to load content: ${path}`, err);
        if (isMounted) {
          setError(err as Error);
          onError?.(err as Error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadContent();
    
    return () => {
      isMounted = false;
    };
  }, [path, onError]);

  if (loading) {
    return <div className={`content-loading ${className}`}>Loading...</div>;
  }

  if (error || !url) {
    return fallback ? (
      <div className={`content-error ${className}`}>{fallback}</div>
    ) : (
      <div className={`content-error ${className}`}>Failed to load content</div>
    );
  }

  switch (type) {
    case 'video':
      return (
        <video
          src={url}
          className={className}
          style={style}
          onLoadedData={onLoadedData}
          {...props}
        />
      );
    case 'audio':
      return (
        <audio
          src={url}
          className={className}
          style={style}
          {...props}
        />
      );
    case 'image':
      return (
        <img
          src={url}
          className={className}
          style={style}
          onLoad={onLoadedData}
          alt={props.alt || 'Content'}
          {...props}
        />
      );
    default:
      return null;
  }
};

export default ContentMedia;
