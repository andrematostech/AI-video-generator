import {
  buildAddNarrationTrackArgs,
  buildConcatListContent,
  buildRenderSceneClipArgs
} from "@/lib/server/ffmpeg";

describe("FFmpeg command builders", () => {
  it("builds normalized render args for scene clips", () => {
    const args = buildRenderSceneClipArgs({
      clipPath: "clips/scene-1.mp4",
      outputPath: "render/scene-1.mp4"
    });

    expect(args).toContain("clips/scene-1.mp4");
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args.join(" ")).toContain("scale=1280:720");
    expect(args.at(-1)).toBe("render/scene-1.mp4");
  });

  it("builds concat file content with escaped paths", () => {
    const content = buildConcatListContent([
      "render/scene-1.mp4",
      "render/scene-'2'.mp4"
    ]);

    expect(content).toContain("file 'render/scene-1.mp4'");
    expect(content).toContain("file 'render/scene-'\\''2'\\''.mp4'");
  });

  it("adds subtitle filter args only when a subtitle file is provided", () => {
    const withSubtitles = buildAddNarrationTrackArgs({
      videoPath: "render/final-silent.mp4",
      narrationPath: "audio/narration.mp3",
      subtitlePath: "subtitles/subtitles.srt",
      outputPath: "final-video.mp4"
    });
    const withoutSubtitles = buildAddNarrationTrackArgs({
      videoPath: "render/final-silent.mp4",
      narrationPath: "audio/narration.mp3",
      outputPath: "final-video.mp4"
    });

    expect(withSubtitles).toContain("-vf");
    expect(withSubtitles.join(" ")).toContain("subtitles='subtitles/subtitles.srt'");
    expect(withoutSubtitles).not.toContain("-vf");
    expect(withoutSubtitles).toContain("copy");
  });
});
