# AI Video Generator MVP

Minimal prompt-to-video MVP built with Next.js, OpenAI, Replicate, and FFmpeg.

## Overview

This project takes a single user prompt and runs a local end-to-end pipeline that:

- generates a short script
- plans scenes
- creates video clips
- generates narration audio
- transcribes narration into subtitles
- renders a final MP4

Generated assets are stored on the local filesystem under the configured assets directory.

## Architecture

See `docs/architecture.md` for the project structure and pipeline responsibilities.

## Tech Stack

- Next.js 14 with App Router
- TypeScript
- TailwindCSS
- OpenAI API for script generation, TTS, and transcription
- Replicate for video clip generation
- FFmpeg for local rendering

## Environment Variables

Required:

- `OPENAI_API_KEY`
- `REPLICATE_API_TOKEN`
- `ASSETS_DIR`
- `FFMPEG_PATH`
- `APP_URL`

Optional:

- `OPENAI_MODEL`
- `OPENAI_TTS_MODEL`
- `REPLICATE_MODEL`

Copy `.env.example` to `.env.local` and fill in the values before running the app.

## Setup Instructions

1. Install Node.js 18+.
2. Install FFmpeg locally and confirm it is available in your shell.
3. Copy `.env.example` to `.env.local`.
4. Fill in the required environment variables.
5. Run `npm install`.

## Local Run Instructions

1. Start the web app with `npm run dev`.
2. Start the background worker in a second terminal with `npm run worker`.
3. Open `http://localhost:3000`.
4. Submit a prompt from the homepage.
5. Wait for the job status page to update through the pipeline.
6. Open the result page when the job is completed.

## Pipeline Explanation

1. The homepage sends the user prompt to `POST /api/generate`.
2. The API route creates a local job record and enqueues background work.
3. The worker process claims queued jobs and runs the full generation pipeline asynchronously.
4. OpenAI generates the video title, narration script, and target duration.
5. OpenAI converts the script into structured scenes.
6. Replicate generates a clip for each scene and stores each clip locally.
7. OpenAI TTS generates one narration audio file for the combined scene narration.
8. OpenAI transcription converts the narration audio into timed subtitle segments.
9. A local utility converts the subtitle segments into one `.srt` file.
10. FFmpeg normalizes clips, concatenates them, attaches narration, burns subtitles, and writes the final MP4.
11. The completed job exposes the final video through the result page and video API route.

## Observability

The pipeline records step-level execution traces for:

- script generation
- scene planning
- video clip generation
- narration generation
- subtitle generation
- FFmpeg rendering

These traces are stored in the local database and also appended to a per-job log file at:

- `assets/<job-id>/logs/pipeline.log.jsonl`

## Future Improvements

- Background job execution instead of running the full pipeline inside the request
- Better progress granularity for rendering and transcription
- Cleanup tools for old local assets
- Retry and recovery support for more pipeline stages
- Better browser playback support with streaming or ranged video responses
