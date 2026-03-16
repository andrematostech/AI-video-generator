import { NextRequest, NextResponse } from "next/server";
import { runVideoPipeline } from "@/lib/server/pipeline";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json(
        {
          error: "Prompt is required."
        },
        { status: 400 }
      );
    }

    const result = await runVideoPipeline(prompt);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error."
      },
      { status: 500 }
    );
  }
}
