import { randomUUID } from 'crypto';
import { Job, JobStatus, JobSummary, ApiKeys } from './types';
import { processLoomVideo } from './index';

const MAX_CONCURRENT = 2;

class JobStore {
  private jobs = new Map<string, Job>();
  private activeCount = 0;
  private queue: string[] = [];

  submit(urls: string[], keys: ApiKeys): Job[] {
    const newJobs: Job[] = [];

    for (const url of urls) {
      const job: Job = {
        id: `j_${randomUUID().slice(0, 12)}`,
        url,
        keys,
        status: 'queued',
        progress: 0,
        message: 'In Warteschlange...',
        createdAt: new Date(),
      };

      this.jobs.set(job.id, job);
      this.queue.push(job.id);
      newJobs.push(job);
    }

    this.processQueue();
    return newJobs;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  getAllJobs(): JobSummary[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ keys: _keys, ...job }) => ({
        ...job,
        result: job.result ? { presentationUrl: job.result.presentationUrl } : undefined,
      }));
  }

  private processQueue() {
    while (this.activeCount < MAX_CONCURRENT && this.queue.length > 0) {
      const jobId = this.queue.shift()!;
      const job = this.jobs.get(jobId);
      if (!job) continue;

      this.activeCount++;
      this.runJob(job);
    }
  }

  private async runJob(job: Job) {
    try {
      const result = await processLoomVideo(job.url, job.keys, (status) => {
        // Map pipeline stages to job status
        const statusMap: Record<string, JobStatus> = {
          download: 'downloading',
          transcribe: 'transcribing',
          generate: 'generating',
        };

        job.status = statusMap[status.stage] || job.status;
        job.message = status.message;

        // Calculate overall progress across all 3 stages
        const stageWeights: Record<string, { base: number; weight: number }> = {
          download: { base: 0, weight: 30 },
          transcribe: { base: 30, weight: 40 },
          generate: { base: 70, weight: 30 },
        };

        const sw = stageWeights[status.stage];
        if (sw) {
          job.progress = Math.round(sw.base + (status.progress / 100) * sw.weight);
        }
      });

      if (result.success) {
        job.status = 'completed';
        job.progress = 100;
        job.message = 'Präsentation erstellt!';
        job.result = {
          transcript: result.transcript!,
          presentationUrl: result.presentationUrl!,
        };
      } else {
        job.status = 'failed';
        job.error = result.error || 'Unbekannter Fehler';
        job.message = result.error || 'Verarbeitung fehlgeschlagen';
      }
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unbekannter Fehler';
      job.message = job.error;
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }
}

// Singleton
const globalForJobs = globalThis as unknown as { jobStore?: JobStore };
export const jobStore = globalForJobs.jobStore ?? (globalForJobs.jobStore = new JobStore());
