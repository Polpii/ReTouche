import { NextResponse } from "next/server";
import { uploadVideo } from "../../services/mediaService";

export async function POST(request: Request) {
  try {
    const { filename, videoData } = await request.json();
    
    if (!filename || !videoData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    
    const url = await uploadVideo(filename, videoData);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("Error uploading video:", error);
    return NextResponse.json({ error: "Error uploading video" }, { status: 500 });
  }
}
