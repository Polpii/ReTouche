// app/api/sounds/route.ts
import { NextResponse } from "next/server";
import { getAllSounds, addSound } from "../../services/mediaService";

export async function GET() {
  try {
    const sounds = await getAllSounds();
    return NextResponse.json(sounds);
  } catch (error) {
    console.error("Error fetching sounds:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const soundData = await request.json();
    const newSound = await addSound(soundData);
    return NextResponse.json(newSound, { status: 201 });
  } catch (error) {
    console.error("Error creating sound:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
