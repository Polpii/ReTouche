// app/api/learners/[name]/recordings/[recordingName]/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { deleteRecordingFromLearner } from '../../../../../services/mediaService';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ name: string; recordingName: string }> }
) {
  // ⚠️ ici on await la Promise
  const { name, recordingName } = await context.params;

  try {
    if (!name || !recordingName) {
      return NextResponse.json(
        { error: 'Missing parameters' },
        { status: 400 }
      );
    }

    await deleteRecordingFromLearner(name, recordingName);

    return NextResponse.json(
      { message: 'Recording deleted' }
    );
  } catch (error) {
    console.error('Error deleting recording:', error);
    return NextResponse.json(
      { error: 'Error deleting recording' },
      { status: 500 }
    );
  }
}
