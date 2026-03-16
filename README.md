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

1. Start the app with `npm run dev`.
2. Open `http://localhost:3000`.
3. Submit a prompt from the homepage.
4. Wait for the job status page to update through the pipeline.
5. Open the result page when the job is completed.

## Pipeline Explanation

1. The homepage sends the user prompt to `POST /api/generate`.
2. The server creates a local job record and sets its initial status.
3. OpenAI generates the video title, narration script, and target duration.
4. OpenAI converts the script into structured scenes.
5. Replicate generates a clip for each scene and stores each clip locally.
6. OpenAI TTS generates one narration audio file for the combined scene narration.
7. OpenAI transcription converts the narration audio into timed subtitle segments.
8. A local utility converts the subtitle segments into one `.srt` file.
9. FFmpeg normalizes clips, concatenates them, attaches narration, burns subtitles, and writes the final MP4.
10. The completed job exposes the final video through the result page and video API route.

## Future Improvements

- Background job execution instead of running the full pipeline inside the request
- Better progress granularity for rendering and transcription
- Cleanup tools for old local assets
- Retry and recovery support for more pipeline stages
- Better browser playback support with streaming or ranged video responses
