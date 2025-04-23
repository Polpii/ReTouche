// app/components/types.ts

export interface Section {
    id: string;
    startTime: number;
    endTime: number;
  }
  
  export interface Song {
    id: string;
    title: string;
    videoUrl: string;
    midiUrl: string;
    sections: Section[];
    calibration: {
      topLeft: { x: number; y: number };
      topRight: { x: number; y: number };
      bottomRight: { x: number; y: number };
      bottomLeft: { x: number; y: number };
    };
    performanceScore: number | null;
  }
  