import path from "node:path";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import {
  demoPromptLibrary,
  getDemoPromptById,
  getRandomDemoPrompt
} from "@/lib/demo/prompt-library";
import { buildProjectPaths } from "@/lib/server/filesystem";
import { createVideoJob, readVideoJob } from "@/lib/server/jobs";
import { processVideoJob } from "@/lib/server/pipeline";

function loadEnvironment() {
  for (const envFile of [
    ".env.local",
    ".env"
  ]) {
    loadEnv({
      path: path.resolve(process.cwd(), envFile),
      override: false
    });
  }
}

function readPromptArgument() {
  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    console.log("Available demo prompts:");

    for (const item of demoPromptLibrary) {
      console.log(`- ${item.id} [${item.category}] ${item.title}`);
    }

    process.exit(0);
  }

  const promptIdIndex = args.findIndex((arg) => arg === "--prompt-id");

  if (promptIdIndex >= 0) {
    const promptId = args[promptIdIndex + 1];

    if (!promptId) {
      throw new Error("Please provide a prompt id after --prompt-id.");
    }

    const selectedPrompt = getDemoPromptById(promptId);

    if (!selectedPrompt) {
      throw new Error(`Unknown prompt id: ${promptId}`);
    }

    return selectedPrompt;
  }

  if (args.includes("--random") || args.length === 0) {
    return getRandomDemoPrompt();
  }

  return {
    id: "custom",
    category: "explainer" as const,
    title: "Custom prompt",
    prompt: args.join(" ").trim()
  };
}

async function main() {
  loadEnvironment();

  const selectedPrompt = readPromptArgument();
  const prompt = selectedPrompt.prompt;
  const jobId = randomUUID();
  const directories = buildProjectPaths(jobId);

  await createVideoJob({
    id: jobId,
    prompt,
    assetsDirectory: directories.rootDirectory
  });

  console.log(`Starting demo generation for job ${jobId}`);
  console.log(`Prompt source: ${selectedPrompt.id} (${selectedPrompt.category})`);
  console.log(`Prompt title: ${selectedPrompt.title}`);
  console.log(`Prompt: ${prompt}`);

  let lastStatus = "";
  let lastStep = "";

  const progressTimer = setInterval(async () => {
    try {
      const job = await readVideoJob(jobId);

      if (job.status !== lastStatus || job.progress.currentStep !== lastStep) {
        lastStatus = job.status;
        lastStep = job.progress.currentStep;

        console.log(
          `[${job.status}] ${job.progress.currentStep} (${job.progress.completedScenes}/${job.progress.totalScenes || 0})`
        );
      }
    } catch {
      // Ignore transient read errors while the job is still initializing.
    }
  }, 1500);

  try {
    const result = await processVideoJob(jobId, prompt);
    clearInterval(progressTimer);

    console.log("Demo generation completed successfully.");
    console.log(`Final video: ${result.outputVideoPath}`);
    console.log(`Assets directory: ${result.assetsDirectory}`);
  } catch (error) {
    clearInterval(progressTimer);

    const job = await readVideoJob(jobId).catch(() => null);

    console.error("Demo generation failed.");

    if (job) {
      console.error(`Last status: ${job.status}`);
      console.error(`Last step: ${job.progress.currentStep}`);
      if (job.error) {
        console.error(`Error: ${job.error}`);
      }
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unexpected demo generation error.");
  process.exit(1);
});
