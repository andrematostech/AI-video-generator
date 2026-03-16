import { readVideoJob } from "@/lib/server/jobs";
import { JobStatusPanel } from "@/components/job-status-panel";

type JobStatusPageProps = {
  params: {
    jobId: string;
  };
};

export default async function JobStatusPage({ params }: JobStatusPageProps) {
  const result = await readVideoJob(params.jobId);
  return <JobStatusPanel initialJob={result} />;
}
