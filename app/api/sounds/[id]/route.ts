// app/api/sounds/[id]/route.ts

import { NextResponse, NextRequest } from "next/server";
import {
  updateSound,
  deleteSound as deleteSoundService,
} from "../../../services/mediaService";
import { Sound } from "../../../context/SoundContext";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // On await ici pour satisfaire ParamCheck<RouteContext>
  const { id } = await context.params;

  try {
    const sound = (await request.json()) as Sound;

    // Vérification de cohérence ID URL vs payload
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
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const sound = (await request.json()) as Sound;

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
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
