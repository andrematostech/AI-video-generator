export type VideoScene = {
  sceneIndex: number;
  narration: string;
  videoPrompt: string;
  durationSeconds: number;
  clipPath?: string;
};

export type GeneratedAsset = {
  id: number;
  assetType:
    | "scene_clip"
    | "narration_audio"
    | "subtitle_file"
    | "rendered_scene"
    | "final_video";
  jobId: string;
  sceneIndex?: number;
  filePath: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type PipelineStepLog = {
  id: number;
  jobId: string;
  stepName:
    | "script_generation"
    | "scene_planning"
    | "video_clip_generation"
    | "narration_generation"
    | "subtitle_generation"
    | "ffmpeg_rendering";
  status: "running" | "completed" | "failed";
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
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
  attemptCount: number;
  maxAttempts: number;
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
  generatedAssets: GeneratedAsset[];
  stepLogs: PipelineStepLog[];
};
