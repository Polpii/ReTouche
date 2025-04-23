import { NextResponse } from 'next/server';
import { deleteRecordingFromLearner } from '../../../../../services/mediaService';

export async function DELETE(
  request: Request,
  { params }: { params: { name: string; recordingName: string } }
) {
  try {
    const { name, recordingName } = params;
    
    if (!name || !recordingName) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    
    await deleteRecordingFromLearner(name, recordingName);
    return NextResponse.json({ message: 'Recording deleted' });
  } catch (error) {
    console.error('Error deleting recording:', error);
    return NextResponse.json({ error: 'Error deleting recording' }, { status: 500 });
  }
}