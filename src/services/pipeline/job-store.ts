import { randomUUID } from 'crypto';
import { Job, JobStatus, JobSummary, ApiKeys } from './types';
import { processLoomVideo, downloadAndTranscribe } from './index';
import { createPresentation } from '../gamma';

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
        mode: 'individual',
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

  submitMerge(urls: string[], keys: ApiKeys): Job[] {
    const parentId = `j_${randomUUID().slice(0, 12)}`;
    const childIds: string[] = [];
    const allJobs: Job[] = [];

    // Create child jobs (download + transcribe only)
    for (const url of urls) {
      const child: Job = {
        id: `j_${randomUUID().slice(0, 12)}`,
        url,
        keys,
        mode: 'merge-child',
        parentJobId: parentId,
        status: 'queued',
        progress: 0,
        message: 'In Warteschlange...',
        createdAt: new Date(),
      };

      this.jobs.set(child.id, child);
      this.queue.push(child.id);
      childIds.push(child.id);
      allJobs.push(child);
    }

    // Create parent job (will generate presentation after all children complete)
    const parent: Job = {
      id: parentId,
      url: `${urls.length} Videos zusammenführen`,
      keys,
      mode: 'merge-parent',
      childJobIds: childIds,
      status: 'queued',
      progress: 0,
      message: 'Warte auf Transkriptionen...',
      createdAt: new Date(),
    };

    this.jobs.set(parent.id, parent);
    allJobs.push(parent);

    this.processQueue();
    return allJobs;
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
      // Skip merge-parent jobs in the queue - they are triggered by child completion
      if (job.mode === 'merge-parent') continue;

      this.activeCount++;
      if (job.mode === 'merge-child') {
        this.runMergeChild(job);
      } else {
        this.runJob(job);
      }
    }
  }

  private async runJob(job: Job) {
    try {
      const result = await processLoomVideo(job.url, job.keys, (status) => {
        const statusMap: Record<string, JobStatus> = {
          download: 'downloading',
          transcribe: 'transcribing',
          generate: 'generating',
        };

        job.status = statusMap[status.stage] || job.status;
        job.message = status.message;

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

  private async runMergeChild(job: Job) {
    try {
      const result = await downloadAndTranscribe(job.url, job.keys, (status) => {
        const statusMap: Record<string, JobStatus> = {
          download: 'downloading',
          transcribe: 'transcribing',
        };

        job.status = statusMap[status.stage] || job.status;
        job.message = status.message;

        // For merge children: download = 0-50%, transcribe = 50-100%
        const stageWeights: Record<string, { base: number; weight: number }> = {
          download: { base: 0, weight: 50 },
          transcribe: { base: 50, weight: 50 },
        };

        const sw = stageWeights[status.stage];
        if (sw) {
          job.progress = Math.round(sw.base + (status.progress / 100) * sw.weight);
        }
      });

      if (result.success) {
        job.status = 'completed';
        job.progress = 100;
        job.message = 'Transkription abgeschlossen';
        job.result = { transcript: result.transcript!, presentationUrl: '' };
      } else {
        job.status = 'failed';
        job.error = result.error || 'Unbekannter Fehler';
        job.message = result.error || 'Transkription fehlgeschlagen';
      }
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unbekannter Fehler';
      job.message = job.error;
    } finally {
      this.activeCount--;
      this.checkMergeCompletion(job.parentJobId!);
      this.processQueue();
    }
  }

  private async checkMergeCompletion(parentId: string) {
    const parent = this.jobs.get(parentId);
    if (!parent || !parent.childJobIds) return;

    const children = parent.childJobIds.map((id) => this.jobs.get(id)!);

    // Check if any child failed
    const failedChild = children.find((c) => c.status === 'failed');
    if (failedChild) {
      parent.status = 'failed';
      parent.error = `Video fehlgeschlagen: ${failedChild.error}`;
      parent.message = parent.error;
      return;
    }

    // Check if all children are completed
    const allDone = children.every((c) => c.status === 'completed');
    if (!allDone) {
      // Update parent progress based on children
      const completedCount = children.filter((c) => c.status === 'completed').length;
      parent.progress = Math.round((completedCount / children.length) * 70);
      parent.message = `Transkription ${completedCount}/${children.length} fertig...`;
      return;
    }

    // All children done - combine transcripts and generate presentation
    parent.status = 'generating';
    parent.progress = 75;
    parent.message = 'Erstelle Präsentation aus allen Transkripten...';

    try {
      const combinedTranscript = children
        .map((child, i) => {
          const videoId = child.url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/)?.[1] || `Video ${i + 1}`;
          return `--- Video ${i + 1} (${videoId}) ---\n${child.result!.transcript}`;
        })
        .join('\n\n');

      const presentationResult = await createPresentation(
        combinedTranscript,
        parent.keys.gammaKey,
        parent.keys.gammaTemplateId,
        parent.keys.numCards
      );

      parent.status = 'completed';
      parent.progress = 100;
      parent.message = 'Präsentation erstellt!';
      parent.result = {
        transcript: combinedTranscript,
        presentationUrl: presentationResult.gammaUrl,
      };
    } catch (error) {
      parent.status = 'failed';
      parent.error = error instanceof Error ? error.message : 'Präsentationserstellung fehlgeschlagen';
      parent.message = parent.error;
    }
  }
}

// Singleton
const globalForJobs = globalThis as unknown as { jobStore?: JobStore };
export const jobStore = globalForJobs.jobStore ?? (globalForJobs.jobStore = new JobStore());
