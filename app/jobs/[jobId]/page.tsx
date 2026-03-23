import { redirect } from "next/navigation";

type JobStatusPageProps = {
  params: {
    jobId: string;
  };
};

export default async function JobStatusPage({ params }: JobStatusPageProps) {
  redirect(`/?job=${params.jobId}`);
}
