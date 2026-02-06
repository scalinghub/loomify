export type ProcessingStage = 'download' | 'transcribe' | 'generate';

export interface ProcessingStatus {
  stage: ProcessingStage;
  progress: number; // 0-100
  message: string;
}

export interface ProcessingResult {
  success: boolean;
  transcript?: string;
  presentationUrl?: string;
  error?: string;
}

export class ProcessingError extends Error {
  stage: ProcessingStage;
  code: string;
  retryable: boolean;
  details?: unknown;

  constructor(options: {
    stage: ProcessingStage;
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  }) {
    super(options.message);
    this.name = 'ProcessingError';
    this.stage = options.stage;
    this.code = options.code;
    this.retryable = options.retryable;
    this.details = options.details;
  }
}

export interface DownloadResult {
  filePath: string;
  fileName: string;
  cleanup: () => Promise<void>;
}

export interface TranscriptionResult {
  transcript: string;
  language: string;
}

export interface PresentationResult {
  generationId: string;
  gammaUrl: string;
}

// API Keys passed per request
export interface ApiKeys {
  geminiKey: string;
  gammaKey: string;
  gammaTemplateId?: string;
}

// Job types for batch processing
export type JobStatus = 'queued' | 'downloading' | 'transcribing' | 'generating' | 'completed' | 'failed';
export type JobMode = 'individual' | 'merge-parent' | 'merge-child';

export interface Job {
  id: string;
  url: string;
  keys: ApiKeys;
  mode: JobMode;
  parentJobId?: string;     // merge-child: reference to parent
  childJobIds?: string[];   // merge-parent: all child job IDs
  status: JobStatus;
  progress: number; // 0-100
  message: string;
  result?: {
    transcript: string;
    presentationUrl: string;
  };
  error?: string;
  createdAt: Date;
}

export type JobSummary = Omit<Job, 'result' | 'keys'> & {
  result?: {
    presentationUrl: string;
  };
};
