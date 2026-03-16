import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { readVideoJobOutputPath } from "@/lib/server/jobs";

type RouteContext = {
  params: {
    jobId: string;
  };
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const videoPath = await readVideoJobOutputPath(context.params.jobId);
    const videoBuffer = await readFile(videoPath);

    return new NextResponse(videoBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="${path.basename(videoPath)}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Video not found."
      },
      { status: 404 }
    );
  }
}
