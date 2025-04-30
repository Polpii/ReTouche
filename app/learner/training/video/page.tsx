"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PerspectiveTransform, { Points } from "../../../../components/PerspectiveTransform";
import { Rnd } from "react-rnd";
import { useLearnerContext } from "../../../context/LearnerContext";
import { savePositionConfig, getPositionConfig } from "../../../services/calibrationService";

type VideoConfig = {
  soundId: string | null;
  sectionStart?: number;
  sectionEnd?: number;
  videoUrl: string;
  type: string;
  calibrationConfig: any;
  absoluteCrop: { x: number; y: number; width: number; height: number } | null;
  absolutePoints: Points | null;
  absoluteVideoOffset: { x: number; y: number } | null;
  videoDelayMs: number;
  isLooping: boolean;
  loopLayers: any[];
  editable: boolean;
  containerPos?: { x: number; y: number };
};

export default function VideoPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { currentLearnerName } = useLearnerContext();
  const [config, setConfig] = useState<VideoConfig | null>(null);
  const [containerPos, setContainerPos] = useState({ x: 0, y: 0 });
  const [loadedFromFirebase, setLoadedFromFirebase] = useState(false);

  useEffect(() => {
    const item = sessionStorage.getItem('mirrorFugueVideoConfig');
    if (!item) {
      router.push('/learner/training');
      return;
    }
    // parse and ensure soundId is included
    const parsed = JSON.parse(item);
    setConfig({
      soundId: parsed.soundId ?? null,
      sectionStart: parsed.sectionStart,
      sectionEnd: parsed.sectionEnd,
      videoUrl: parsed.videoUrl,
      type: parsed.type,
      calibrationConfig: parsed.calibrationConfig,
      absoluteCrop: parsed.absoluteCrop,
      absolutePoints: parsed.absolutePoints,
      absoluteVideoOffset: parsed.absoluteVideoOffset,
      videoDelayMs: parsed.videoDelayMs,
      isLooping: parsed.isLooping,
      loopLayers: parsed.loopLayers,
      editable: parsed.editable,
      containerPos: parsed.containerPos
    });
  }, [router]);

  // Initialize container position from config
  useEffect(() => {
    if (config?.containerPos) {
      setContainerPos(config.containerPos);
    }
  }, [config]);

  // Fetch saved position & points from Firebase once config is loaded
  useEffect(() => {
    if (!loadedFromFirebase && config?.soundId && currentLearnerName) {
      getPositionConfig(currentLearnerName, config.soundId)
        .then(saved => {
          if (saved) {
            // update containerPos and points
            const updatedConfig = {
              ...config,
              absolutePoints: saved.perspectivePoints,
              containerPos: saved.position
            };
            setContainerPos(saved.position);
            setConfig(updatedConfig);
            sessionStorage.setItem('mirrorFugueVideoConfig', JSON.stringify(updatedConfig));
          }
        })
        .finally(() => setLoadedFromFirebase(true));
    }
  }, [config, loadedFromFirebase, currentLearnerName]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.type === 'updateConfig') {
        setConfig(prev => prev ? { ...prev, editable: data.editable } : prev);
      }
      if (data?.type === 'playSection') {
        // reposition and play new section
        setConfig(prev => prev ? { ...prev, sectionStart: data.sectionStart, sectionEnd: data.sectionEnd } : prev);
        const vid = videoRef.current;
        if (vid && typeof data.sectionStart === 'number') {
          vid.currentTime = data.sectionStart;
          setTimeout(() => vid.play().catch(() => {}), config?.videoDelayMs);
          const dur = (data.sectionEnd - data.sectionStart) * 1000;
          setTimeout(() => { vid.pause(); }, dur);
        }
      }
      if (data?.type === 'loadAndPlay') {
        const vid = videoRef.current;
        if (vid && typeof data.videoUrl === 'string') {
          vid.pause();
          vid.src = data.videoUrl;
          vid.load();
          // play after configured delay
          setTimeout(() => vid.play().catch(() => {}), config?.videoDelayMs ?? 0);
        }
      }
      if (data?.type === 'updateSpeed') {
        const vid = videoRef.current;
        if (vid && typeof data.newSpeed === 'number') {
          vid.playbackRate = data.newSpeed;
        }
      }
      if (data?.type === 'stopAll') {
        const vid = videoRef.current;
        if (vid) {
          vid.pause();
          // Optionally reset to start of section if desired
        }
      }
      if (data?.type === 'resetDefault') {
        const vid = videoRef.current;
        if (vid && config?.videoUrl) {
          vid.pause();
          vid.src = config.videoUrl;
          vid.load();
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [config]);

  // Handler for when user adjusts perspective points
  const handlePointsChange = (newPoints: Points) => {
    setConfig(prev => {
      if (!prev) return prev;
      const updated = { ...prev, absolutePoints: newPoints };
      sessionStorage.setItem('mirrorFugueVideoConfig', JSON.stringify(updated));
      // Save config for this sound
      if (currentLearnerName && updated.soundId) {
        savePositionConfig(currentLearnerName, updated.soundId, {
          position: containerPos,
          perspectivePoints: updated.absolutePoints
        }).catch(console.error);
      }
      return updated;
    });
  };

  if (!config) return null;

  const { videoUrl, calibrationConfig: _, absoluteCrop: crop, absolutePoints: points, absoluteVideoOffset: offset, videoDelayMs: delay, isLooping: loop, loopLayers: layers, editable } = config;

  return (
    <Rnd
      position={containerPos}
      onDragStop={(_, d) => {
        setContainerPos({ x: d.x, y: d.y });
        // Persist new position
        if (currentLearnerName && config.soundId) {
          savePositionConfig(currentLearnerName, config.soundId, {
            position: { x: d.x, y: d.y },
            perspectivePoints: config.absolutePoints
          }).catch(console.error);
          // also update session storage
          const updated = { ...config, containerPos: { x: d.x, y: d.y } };
          sessionStorage.setItem('mirrorFugueVideoConfig', JSON.stringify(updated));
        }
      }}
    >
      <div
        style={{
          width: config.absoluteCrop?.width || 640,
          height: config.absoluteCrop?.height || 360,
          position: 'relative',
          overflow: 'visible'
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: config.absoluteCrop?.x || 0,
            top: config.absoluteCrop?.y || 0,
            width: config.absoluteCrop?.width || 640,
            height: config.absoluteCrop?.height || 360,
            overflow: 'visible'
          }}
        >
          <PerspectiveTransform
            points={points || { topLeft: { x:0,y:0 }, topRight:{x:640,y:0}, bottomRight:{x:640,y:360}, bottomLeft:{x:0,y:360} }}
            editable={editable}
            onPointsChange={handlePointsChange}
          >
            <video
              ref={videoRef}
              src={config.videoUrl}
              playsInline
              preload="metadata"
              onEnded={() => {
                // After non-section playback (e.g., recorded or loadAndPlay), reset to default video
                if (config.type !== 'default' && config.type !== 'section') {
                  const vid = videoRef.current;
                  if (vid && config.videoUrl) {
                    vid.pause();
                    vid.src = config.videoUrl;
                    vid.load();
                  }
                }
              }}
              onLoadedMetadata={(e) => {
                const vid = e.currentTarget;
                if (config.sectionStart != null) {
                  vid.currentTime = config.sectionStart;
                  setTimeout(() => vid.play().catch(() => {}), config.videoDelayMs);
                  const dur = ((config.sectionEnd ?? vid.duration) - config.sectionStart) * 1000;
                  setTimeout(() => { vid.pause(); router.back(); }, dur);
                }
              }}
              style={{
                position: 'absolute',
                left: offset?.x ? -offset.x : 0,
                top: offset?.y ? -offset.y : 0,
                width: '640px',
                height: 'auto'
              }}
            />
          </PerspectiveTransform>
        </div>
      </div>
    </Rnd>
  );
}
