import { NextRequest, NextResponse } from 'next/server';
import { jobStore } from '@/services/pipeline/job-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = jobStore.getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: 'Job nicht gefunden' },
      { status: 404 }
    );
  }

  return NextResponse.json({ job });
}
