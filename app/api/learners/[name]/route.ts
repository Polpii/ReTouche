// app/api/learners/[name]/route.ts

import { NextResponse, NextRequest } from "next/server";
import { updateLearner } from "../../../services/mediaService";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  // On récupère ici l'objet params depuis la Promise
  const { name } = await context.params;

  try {
    const updatedProfile = await request.json();

    // Vérification que le nom dans l'URL correspond à celui du payload
    if (updatedProfile.name !== name) {
      return NextResponse.json(
        { error: "Name mismatch between URL and data" },
        { status: 400 }
      );
    }

    await updateLearner(updatedProfile);
    return NextResponse.json(updatedProfile);
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
