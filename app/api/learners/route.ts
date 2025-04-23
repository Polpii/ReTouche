import { NextResponse } from "next/server";
import { addLearner, getAllLearners } from "../../services/mediaService";

export async function GET() {
  try {
    const learners = await getAllLearners();
    return NextResponse.json(learners);
  } catch (error) {
    console.error("Error reading learners:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const newLearner = await request.json();
    const savedLearner = await addLearner(newLearner);
    return NextResponse.json(savedLearner, { status: 201 });
  } catch (error) {
    console.error("Error creating learner:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
