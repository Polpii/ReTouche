// app/api/upload-midi/route.ts
import { NextResponse } from "next/server";
import { uploadMidiData } from "../../services/mediaService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filename, midiData } = body;
    
    if (!filename || !midiData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    
    const url = await uploadMidiData(filename, midiData);
    return NextResponse.json({ url }, { status: 200 });
  } catch (error) {
    console.error("Error uploading MIDI:", error);
    return NextResponse.json({ error: "Error uploading MIDI" }, { status: 500 });
  }
}
