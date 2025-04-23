// app/components/PerformanceEvaluator.ts
export interface NoteEvent {
    midi: number;
    time: number; // en secondes
    duration: number; // en secondes
  }
  
  export function evaluatePerformance(
    expectedNotes: NoteEvent[],
    playedNotes: NoteEvent[]
  ): number {
    let totalError = 0;
    let count = 0;
  
    expectedNotes.forEach((expected) => {
      const closest = playedNotes.reduce((prev, curr) => {
        return Math.abs(curr.time - expected.time) <
          Math.abs(prev.time - expected.time)
          ? curr
          : prev;
      }, playedNotes[0] || { time: expected.time, midi: expected.midi, duration: expected.duration });
  
      const error = Math.abs(closest.time - expected.time);
      totalError += error;
      count++;
    });
  
    const avgError = count > 0 ? totalError / count : 0;
    let score = Math.max(0, 100 - avgError * 100);
    return score;
  }
  