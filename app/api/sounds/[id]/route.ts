// app/api/sounds/[id]/route.ts
import { NextResponse } from "next/server";
import { updateSound, deleteSound as deleteSoundService } from "../../../services/mediaService";
import { Sound } from "../../../context/SoundContext";

export async function PUT(request: Request, context: { params: { id: string } }) {
  try {
    const sound = await request.json() as Sound;
    const { id } = context.params;
    
    // Make sure the ID in URL matches the ID in the data
    if (sound.id !== id) {
      return NextResponse.json(
        { error: "ID mismatch between URL and data" }, 
        { status: 400 }
      );
    }
    
    await updateSound(sound);
    return NextResponse.json(sound);
  } catch (error) {
    console.error("Error updating sound:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: { id: string } }) {
  try {
    const { id } = context.params;
    
    // This is a simplification - in a real app, you would fetch the sound first
    // We're assuming the frontend passes the complete sound object
    const sound = await request.json() as Sound;
    
    if (sound.id !== id) {
      return NextResponse.json(
        { error: "ID mismatch between URL and data" }, 
        { status: 400 }
      );
    }
    
    await deleteSoundService(sound);
    return NextResponse.json({ message: "Sound deleted" });
  } catch (error) {
    console.error("Error deleting sound:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
