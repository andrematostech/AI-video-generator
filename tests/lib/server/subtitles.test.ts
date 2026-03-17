import { buildSrt } from "@/lib/server/subtitles";

describe("buildSrt", () => {
  it("creates numbered SRT subtitles with timestamps", () => {
    const srt = buildSrt([
      {
        startSeconds: 0,
        endSeconds: 1.25,
        text: "Hello world"
      },
      {
        startSeconds: 1.25,
        endSeconds: 3.5,
        text: "Second line"
      }
    ]);

    expect(srt).toContain("1");
    expect(srt).toContain("00:00:00,000 --> 00:00:01,250");
    expect(srt).toContain("Hello world");
    expect(srt).toContain("00:00:01,250 --> 00:00:03,500");
    expect(srt).toContain("Second line");
  });
});
