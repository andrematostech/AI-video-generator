# AI Video Generator MVP

An end-to-end AI video generation MVP that turns a single prompt into a rendered MP4 using Next.js, OpenAI, Replicate, FFmpeg, a local worker, and local-first persistence.

## Project Overview

This project was built to demonstrate a practical prompt-to-video pipeline with a clean MVP architecture:

- a Next.js frontend for prompt input, job tracking, and result playback
- a lightweight API layer for job creation and status retrieval
- a filesystem-backed local queue plus worker process for background generation
- OpenAI for script generation, scene planning, narration, transcription, and metadata
- Replicate for scene-level video clip generation
- FFmpeg for final assembly, subtitle burn-in, and MP4 output

The result is a developer-friendly local system that is easy to run, inspect, test, and extend.

## Why This Project

The goal is not to replicate a production-scale video platform. The goal is to show strong full-stack product engineering across:

- AI workflow orchestration
- background job processing
- local-first persistence
- media rendering
- observability and operational readiness
- clean MVP-focused architecture decisions

## Architecture

Architecture documentation lives in [docs/architecture.md](docs/architecture.md).

Related assets:

- Diagram source: [architecture-diagram.mmd](docs/architecture-diagram.mmd)
- Rendered diagram: [architecture-diagram.svg](docs/architecture-diagram.svg)

At a high level:

- the frontend submits prompts and polls job state
- the API server creates jobs and enqueues background work
- the worker runs the full generation pipeline asynchronously
- the pipeline persists job state, scenes, generated asset records, logs, metadata, and performance metrics
- media files stay on the local filesystem while structured state lives in a local SQLite database

## Pipeline

The generation flow is:

1. User submits a prompt.
2. `POST /api/generate` creates a job and enqueues it.
3. The worker claims the job from the local queue.
4. OpenAI generates a title, narration script, and target duration.
5. OpenAI converts the script into 4-6 structured scenes.
6. Replicate generates a short video clip for each scene.
7. OpenAI TTS generates a single narration audio track.
8. OpenAI transcription creates timestamped subtitle segments.
9. The subtitle utility converts transcript segments into `.srt`.
10. FFmpeg normalizes clips, concatenates them, adds narration, burns subtitles, and renders the final MP4.
11. OpenAI generates final video metadata such as description and tags.
12. The UI exposes job status, metrics, logs, and the final result.

## Tech Stack

- Next.js 14 App Router
- TypeScript
- React
- TailwindCSS
- OpenAI API
- Replicate API
- FFmpeg
- `sql.js` for local persistent storage
- Vitest for automated testing
- Docker Compose for containerized local development

## Features

- Prompt-to-video generation flow
- Background worker and local queue
- Persistent jobs, scenes, assets, logs, and metrics
- Job polling UI with progress and execution trace
- Result page with embedded playback and download
- Demo CLI for non-UI generation
- Mock providers for deterministic test coverage
- Scheduled cleanup of temporary assets
- Health check endpoint for local readiness verification

## Installation

### Prerequisites

- Node.js 18+
- npm
- FFmpeg installed locally and available in your shell

### Setup

1. Install dependencies:

   `npm install`

2. Create your local environment file:

   Configure `.env`

3. Fill in the required environment variables.

4. Start the app and worker in separate terminals:

   - `npm run dev`
   - `npm run worker`

5. Open `http://localhost:3000`

## Environment Setup

Required variables:

- `OPENAI_API_KEY`
- `REPLICATE_API_TOKEN`
- `ASSETS_DIR`
- `FFMPEG_PATH`
- `APP_URL`

Common optional variables:

- `OPENAI_MODEL`
- `OPENAI_TTS_MODEL`
- `REPLICATE_MODEL`
- `CLEANUP_ENABLED`
- `CLEANUP_INTERVAL_MINUTES`
- `CLEANUP_TEMP_FILE_TTL_HOURS`
- `CLEANUP_KEEP_FINAL_VIDEOS`

## Demo Generation

You can run the pipeline without the UI using the demo CLI.

Generate a video from a custom prompt:

`npm run demo -- "Create a cinematic 20 second promo video for a mindfulness app."`

Use a curated prompt from the prompt library:

- `npm run demo -- --list`
- `npm run demo -- --random`
- `npm run demo -- --prompt-id explainer-ai-notes`

The output video is written to the configured assets directory under the generated job folder.

## Local Development

Web app:

- `npm run dev`

Worker:

- `npm run worker`

Tests:

- `npm test`
- `npm run typecheck`
- `npm run lint`

Docker:

- `docker compose up --build`

## Screenshots

Portfolio placeholders you can replace with real captures:

- Homepage prompt input
- Job status page with progress, logs, and metrics
- Final result page with embedded video player
- Architecture diagram preview

Suggested image locations:

- `docs/screenshots/homepage.png`
- `docs/screenshots/job-status.png`
- `docs/screenshots/result-page.png`

## Observability

The pipeline records:

- step-level execution logs
- per-job performance metrics
- persistent job state and generated asset metadata

Useful inspection points:

- job API: `/api/jobs/<job-id>`
- health endpoint: `/api/health`
- per-job logs: `assets/<job-id>/logs/pipeline.log.jsonl`
- local database: `assets/.data/video-generator.sqlite`

## Future Improvements

- richer render progress reporting
- stronger failure recovery across more pipeline stages
- advanced streaming for final video playback
- improved queue controls and operational tooling
- multi-user tenancy, auth, and hosted storage for a production version

## Documentation

- Architecture overview: [docs/architecture.md](docs/architecture.md)
- Architecture diagram source: [docs/architecture-diagram.mmd](docs/architecture-diagram.mmd)
- Architecture diagram: [docs/architecture-diagram.svg](docs/architecture-diagram.svg)
