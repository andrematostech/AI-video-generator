export type VideoScene = {
  sceneIndex: number;
  narration: string;
  videoPrompt: string;
  durationSeconds: number;
  clipPath?: string;
};

export type SubtitleSegment = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

export type VideoPlan = {
  title: string;
  script: string;
  targetDurationSeconds: number;
  scenes: VideoScene[];
};

export type GeneratedScript = {
  title: string;
  narrationScript: string;
  targetDurationSeconds: number;
};

export type VideoJobStatus =
  | "queued"
  | "generating_script"
  | "generating_scenes"
  | "generating_video_clips"
  | "generating_narration"
  | "generating_subtitles"
  | "rendering_video"
  | "completed"
  | "failed";

export type VideoJobResult = {
  id: string;
  prompt: string;
  status: VideoJobStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
  title: string;
  script: string;
  targetDurationSeconds: number;
  scenes: VideoScene[];
  progress: {
    completedScenes: number;
    totalScenes: number;
    currentStep: string;
  };
  narrationAudioPath?: string;
  subtitlePath?: string;
  outputVideoPath: string;
  assetsDirectory: string;
};
