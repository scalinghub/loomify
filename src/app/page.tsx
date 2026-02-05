'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface JobData {
  id: string;
  url: string;
  status: string;
  progress: number;
  message: string;
  result?: { presentationUrl: string };
  error?: string;
}

interface Settings {
  geminiKey: string;
  gammaKey: string;
  gammaTemplateId: string;
}

const STORAGE_KEY = 'loomify-settings';

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  queued: { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b' },
  downloading: { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb' },
  transcribing: { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb' },
  generating: { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb' },
  completed: { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a' },
  failed: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'Warteschlange',
  downloading: 'Wird heruntergeladen...',
  transcribing: 'Wird transkribiert...',
  generating: 'Präsentation wird erstellt...',
  completed: 'Fertig!',
  failed: 'Fehlgeschlagen',
};

function extractVideoId(url: string): string {
  const match = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  return match?.[1]?.slice(0, 8) || url.slice(-8);
}

function loadSettings(): Settings {
  if (typeof window === 'undefined') return { geminiKey: '', gammaKey: '', gammaTemplateId: '' };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Ignore parse errors
  }
  return { geminiKey: '', gammaKey: '', gammaTemplateId: '' };
}

function saveSettings(settings: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function getApiHeaders(settings: Settings): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (settings.geminiKey) headers['x-gemini-key'] = settings.geminiKey;
  if (settings.gammaKey) headers['x-gamma-key'] = settings.gammaKey;
  if (settings.gammaTemplateId) headers['x-gamma-template'] = settings.gammaTemplateId;
  return headers;
}

export default function Home() {
  const [urls, setUrls] = useState('');
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [settings, setSettings] = useState<Settings>({ geminiKey: '', gammaKey: '', gammaTemplateId: '' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const keysConfigured = settings.geminiKey.trim().length > 0 && settings.gammaKey.trim().length > 0;
  const hasActiveJobs = jobs.some((j) => !['completed', 'failed'].includes(j.status));

  // Load settings from localStorage on mount
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    if (!loaded.geminiKey || !loaded.gammaKey) {
      setSettingsOpen(true);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      if (data.jobs) {
        setJobs(data.jobs);
      }
    } catch {
      // Ignore polling errors
    }
  }, []);

  // Poll for job updates
  useEffect(() => {
    if (hasActiveJobs) {
      pollingRef.current = setInterval(fetchJobs, 3000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [hasActiveJobs, fetchJobs]);

  const handleSaveSettings = () => {
    saveSettings(settings);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
    if (keysConfigured) {
      setSettingsOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urls.trim() || submitting || !keysConfigured) return;

    setSubmitting(true);
    setSubmitError('');

    const urlList = urls
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urlList.length === 0) {
      setSubmitError('Bitte mindestens eine URL eingeben');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: getApiHeaders(settings),
        body: JSON.stringify({ urls: urlList }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || 'Fehler beim Einreichen');
        setSubmitting(false);
        return;
      }

      setUrls('');
      await fetchJobs();
    } catch {
      setSubmitError('Verbindungsfehler');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    background: '#f8fafc',
    fontSize: 14,
    outline: 'none',
    color: '#0f172a',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ minHeight: '100vh', padding: '48px 16px', maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 8 }}>Loomify</h1>
        <p style={{ fontSize: 16, opacity: 0.6 }}>
          Verwandle Loom-Videos automatisch in Präsentationen
        </p>
      </div>

      {/* Settings */}
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: settingsOpen ? 24 : '14px 24px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        border: `1px solid ${keysConfigured ? '#e2e8f0' : '#fecaca'}`,
        marginBottom: 16,
        transition: 'all 0.2s',
      }}>
        <div
          onClick={() => setSettingsOpen(!settingsOpen)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>
            Einstellungen
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {keysConfigured && (
              <span style={{
                fontSize: 12,
                color: '#16a34a',
                background: '#f0fdf4',
                padding: '2px 10px',
                borderRadius: 20,
                fontWeight: 500,
              }}>
                Konfiguriert
              </span>
            )}
            {!keysConfigured && (
              <span style={{
                fontSize: 12,
                color: '#dc2626',
                background: '#fef2f2',
                padding: '2px 10px',
                borderRadius: 20,
                fontWeight: 500,
              }}>
                Keys fehlen
              </span>
            )}
            <span style={{ fontSize: 14, color: '#94a3b8', transform: settingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              ▼
            </span>
          </div>
        </div>

        {settingsOpen && (
          <div style={{ marginTop: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: '#475569' }}>
                Google Gemini API Key *
              </label>
              <input
                type="password"
                value={settings.geminiKey}
                onChange={(e) => setSettings({ ...settings, geminiKey: e.target.value })}
                placeholder="AIzaSy..."
                style={inputStyle}
              />
              <span style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                Aus Google AI Studio
              </span>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: '#475569' }}>
                Gamma API Key *
              </label>
              <input
                type="password"
                value={settings.gammaKey}
                onChange={(e) => setSettings({ ...settings, gammaKey: e.target.value })}
                placeholder="sk-gamma-..."
                style={inputStyle}
              />
              <span style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                Aus Gamma Settings &gt; API
              </span>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: '#475569' }}>
                Gamma Template ID (optional)
              </label>
              <input
                type="text"
                value={settings.gammaTemplateId}
                onChange={(e) => setSettings({ ...settings, gammaTemplateId: e.target.value })}
                placeholder="Leer lassen für Standard-Template"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={handleSaveSettings}
                style={{
                  padding: '8px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#2563eb',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Speichern
              </button>
              {settingsSaved && (
                <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 500 }}>
                  Gespeichert!
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 32 }}>
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          border: '1px solid #e2e8f0',
        }}>
          <label
            htmlFor="loom-urls"
            style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#334155' }}
          >
            Loom Video URLs (eine pro Zeile)
          </label>
          <textarea
            id="loom-urls"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={'https://www.loom.com/share/abc123\nhttps://www.loom.com/share/def456'}
            disabled={submitting || !keysConfigured}
            rows={4}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: 15,
              outline: 'none',
              color: '#0f172a',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              opacity: submitting || !keysConfigured ? 0.5 : 1,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              {!keysConfigured ? 'Bitte zuerst API-Keys eingeben' : 'Max. 10 URLs gleichzeitig'}
            </span>
            <button
              type="submit"
              disabled={submitting || !urls.trim() || !keysConfigured}
              style={{
                padding: '10px 24px',
                borderRadius: 12,
                border: 'none',
                background: submitting || !urls.trim() || !keysConfigured ? '#94a3b8' : '#2563eb',
                color: 'white',
                fontWeight: 600,
                fontSize: 15,
                cursor: submitting || !urls.trim() || !keysConfigured ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Wird eingereicht...' : 'Alle starten'}
            </button>
          </div>

          {submitError && (
            <p style={{ color: '#dc2626', fontSize: 14, marginTop: 8 }}>{submitError}</p>
          )}
        </div>
      </form>

      {/* Jobs List */}
      {jobs.length > 0 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#334155' }}>
            Jobs ({jobs.filter((j) => j.status === 'completed').length}/{jobs.length} fertig)
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {jobs.map((job) => {
              const colors = STATUS_COLORS[job.status] || STATUS_COLORS.queued;
              const label = STATUS_LABELS[job.status] || job.status;
              const isActive = !['completed', 'failed', 'queued'].includes(job.status);

              return (
                <div
                  key={job.id}
                  style={{
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#334155' }}>
                      ...{extractVideoId(job.url)}
                    </span>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: colors.text,
                      background: `${colors.text}15`,
                      padding: '2px 10px',
                      borderRadius: 20,
                    }}>
                      {label}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {isActive && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 3 }}>
                        <div style={{
                          height: 6,
                          background: '#2563eb',
                          borderRadius: 3,
                          transition: 'width 0.5s',
                          width: `${job.progress}%`,
                        }} />
                      </div>
                    </div>
                  )}

                  {/* Message */}
                  <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                    {job.message}
                  </p>

                  {/* Result link */}
                  {job.status === 'completed' && job.result?.presentationUrl && (
                    <a
                      href={job.result.presentationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-block',
                        marginTop: 8,
                        padding: '6px 16px',
                        background: '#16a34a',
                        color: 'white',
                        fontWeight: 500,
                        fontSize: 13,
                        borderRadius: 8,
                        textDecoration: 'none',
                      }}
                    >
                      Präsentation öffnen
                    </a>
                  )}

                  {/* Error */}
                  {job.status === 'failed' && job.error && (
                    <p style={{ fontSize: 13, color: '#dc2626', marginTop: 4, marginBottom: 0 }}>
                      {job.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info */}
      <p style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', marginTop: 32 }}>
        Loomify transkribiert deine Videos mit Google Gemini und erstellt
        automatisch Präsentationen mit Gamma. Max. 2 Videos werden parallel verarbeitet.
      </p>
    </div>
  );
}
