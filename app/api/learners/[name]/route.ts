import { NextResponse } from "next/server";
import { updateLearner } from "../../../services/mediaService";

export async function PUT(request: Request, context: { params: { name: string } }) {
  try {
    const updatedProfile = await request.json();
    const { name } = context.params;
    
    // Make sure the name in URL matches the name in the data
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
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
