import { SubtitleSegment } from "@/lib/types";

function formatTimestamp(seconds: number) {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return [hours, minutes, secs]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":")
    .concat(`,${milliseconds.toString().padStart(3, "0")}`);
}

export function buildSrt(segments: SubtitleSegment[]) {
  return segments
    .map((segment, index) => {
      return [
        `${index + 1}`,
        `${formatTimestamp(segment.startSeconds)} --> ${formatTimestamp(segment.endSeconds)}`,
        segment.text
      ].join("\n");
    })
    .join("\n\n");
}
