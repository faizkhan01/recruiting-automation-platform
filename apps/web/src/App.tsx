import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode
} from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import type { Candidate, ExternalJob, Job, Score, Task } from './types';

function useAsync<T>(loader: () => Promise<T>, dependencies: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await loader());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, dependencies);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loading, error, reload: load };
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            RA
          </span>
          <span className="brand-copy">
            <strong>Recruiting</strong>
            <small>Automation Platform</small>
          </span>
        </Link>
        <nav>
          <NavLink to="/" end>
            Jobs
          </NavLink>
          <NavLink to="/candidates">Candidates</NavLink>
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" />
          Automation online
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function PageState({
  loading,
  error,
  children
}: {
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  if (loading) return <div className="state-card">Loading…</div>;
  if (error) return <div className="state-card error">{error}</div>;
  return children;
}

function Pill({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

type FeedbackToast = {
  tone: 'success' | 'error';
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

function FloatingToast({
  toast,
  onDismiss
}: {
  toast?: FeedbackToast;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  return (
    <div className={`floating-toast ${toast.tone}`} role="status" aria-live="polite">
      <span className="floating-toast-icon" aria-hidden="true">
        {toast.tone === 'success' ? '✓' : '!'}
      </span>
      <p>{toast.message}</p>
      {toast.actionHref && toast.actionLabel && (
        <a
          className="floating-toast-action"
          href={toast.actionHref}
          target="_blank"
          rel="noreferrer"
        >
          {toast.actionLabel}
        </a>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss message">
        ×
      </button>
    </div>
  );
}

function jobMonogram(job: Job): string {
  const source = job.company || job.department || job.title;
  const words = source.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function JobsPage() {
  const navigate = useNavigate();
  const { data: jobs, loading, error, reload } = useAsync(() => api<Job[]>('/api/jobs'), []);
  const [creator, setCreator] = useState<'manual' | 'import' | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [externalJobs, setExternalJobs] = useState<ExternalJob[]>([]);
  const [searching, setSearching] = useState(false);
  const [importingIds, setImportingIds] = useState<string[]>([]);
  const [importedJobs, setImportedJobs] = useState<Record<string, Job>>({});
  const [feedbackToast, setFeedbackToast] = useState<FeedbackToast>();

  useEffect(() => {
    if (!feedbackToast) return;
    const timer = window.setTimeout(() => setFeedbackToast(undefined), 4200);
    return () => window.clearTimeout(timer);
  }, [feedbackToast]);

  function showFeedbackToast(message: string, tone: 'success' | 'error' = 'error') {
    setFeedbackToast({ message, tone });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    try {
      const job = await api<Job>('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title: form.get('title'),
          department: form.get('department') || undefined,
          location: form.get('location'),
          employmentType: form.get('employmentType'),
          description: form.get('description'),
          requirements: String(form.get('requirements') ?? '')
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean),
          skills: String(form.get('skills') ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        })
      });
      await reload();
      navigate(`/jobs/${job._id}`);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Unable to create job');
    } finally {
      setSaving(false);
    }
  }

  async function searchExternalJobs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setFeedbackToast(undefined);
    setImportedJobs({});
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams({
      query: String(form.get('query') ?? ''),
      location: String(form.get('location') ?? ''),
      limit: '10'
    });
    try {
      setExternalJobs(await api<ExternalJob[]>(`/api/jobs/external/search?${query}`));
    } catch (caught) {
      showFeedbackToast(caught instanceof Error ? caught.message : 'Unable to search external jobs');
    } finally {
      setSearching(false);
    }
  }

  async function importExternalJob(externalJob: ExternalJob) {
    if (importingIds.includes(externalJob.externalId) || importedJobs[externalJob.externalId]) return;
    setImportingIds((current) => [...current, externalJob.externalId]);
    setFeedbackToast(undefined);
    try {
      const job = await api<Job>('/api/jobs/import-external', {
        method: 'POST',
        body: JSON.stringify({
          title: externalJob.title,
          company: externalJob.company,
          location: externalJob.location || 'Not specified',
          description: externalJob.description,
          sourceUrl: externalJob.sourceUrl
        })
      });
      await reload();
      setImportedJobs((current) => ({ ...current, [externalJob.externalId]: job }));
      showFeedbackToast(`Imported "${job.title}". You can keep importing more roles.`, 'success');
    } catch (caught) {
      showFeedbackToast(caught instanceof Error ? caught.message : 'Unable to import job');
    } finally {
      setImportingIds((current) => current.filter((id) => id !== externalJob.externalId));
    }
  }

  function toggleCreator(next: 'manual' | 'import') {
    setFormError('');
    setFeedbackToast(undefined);
    setCreator((current) => (current === next ? null : next));
  }

  return (
    <Layout>
      <FloatingToast toast={feedbackToast} onDismiss={() => setFeedbackToast(undefined)} />
      <header className="page-header">
        <div>
          <p className="eyebrow">Recruiting workspace</p>
          <h1>Open roles</h1>
          <p>Source, evaluate, and engage candidates from one focused workflow.</p>
        </div>
        <div className="header-actions">
          <button
            className={creator === 'import' ? 'primary' : 'secondary'}
            onClick={() => toggleCreator('import')}
          >
            Import from web
          </button>
          <button
            className={creator === 'manual' ? 'primary' : 'secondary'}
            onClick={() => toggleCreator('manual')}
          >
            Create manually
          </button>
        </div>
      </header>

      {creator === 'manual' && (
        <form className="panel job-form" onSubmit={submit}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Manual role</p>
              <h2>Create a job opening</h2>
            </div>
            <span>Enter the role details your team will recruit against.</span>
          </div>
          <div className="form-grid">
            <label>
              Role title
              <input name="title" required minLength={2} placeholder="Lead MERN Engineer" />
            </label>
            <label>
              Department
              <input name="department" placeholder="Engineering" />
            </label>
            <label>
              Location
              <input name="location" required defaultValue="Remote" />
            </label>
            <label>
              Employment
              <select name="employmentType" defaultValue="full-time">
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>
            </label>
            <label className="wide">
              Description
              <textarea
                name="description"
                required
                minLength={20}
                rows={4}
                placeholder="Describe the role, team, and impact…"
              />
            </label>
            <label>
              Skills, comma-separated
              <input name="skills" placeholder="Node.js, React, MongoDB" />
            </label>
            <label>
              Requirements, one per line
              <textarea name="requirements" rows={3} placeholder={'5+ years experience\nTeam leadership'} />
            </label>
          </div>
          {formError && <p className="inline-error">{formError}</p>}
          <button className="primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create role'}
          </button>
        </form>
      )}

      {creator === 'import' && (
        <section className="panel external-job-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Serper job search</p>
              <h2>Import a public job listing</h2>
            </div>
            <span>Search indexed listings, review the source, then add one to your workspace.</span>
          </div>
          <form className="external-search-form" onSubmit={searchExternalJobs}>
            <label>
              Job title or keywords
              <input name="query" required minLength={2} placeholder="Senior Node.js Engineer" />
            </label>
            <label>
              Location
              <input name="location" placeholder="Remote or New York" />
            </label>
            <button className="primary search-button" disabled={searching}>
              {searching ? 'Searching…' : 'Search jobs'}
            </button>
          </form>
          {searching && (
            <div
              className="mt-6 overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6 shadow-[0_18px_50px_-28px_rgba(5,150,105,0.55)]"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-5">
                <div className="relative grid h-14 w-14 shrink-0 place-items-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300/35" />
                  <span className="absolute inset-1 animate-spin rounded-full border-[3px] border-emerald-100 border-t-emerald-600 border-r-teal-400" />
                  <svg
                    className="relative h-5 w-5 text-emerald-700"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="6" />
                    <path d="m16 16 4 4" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="m-0 font-semibold text-slate-900">Searching public job listings</p>
                      <p className="mt-1 mb-0 text-sm text-slate-500">
                        Serper is scanning direct LinkedIn postings and preparing import-ready roles.
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold tracking-wide text-emerald-700 uppercase">
                      Live search
                    </span>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-emerald-100">
                    <span className="block h-full w-2/5 animate-[job-search_1.35s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500" />
                  </div>
                </div>
              </div>
            </div>
          )}
          {!searching && externalJobs.length > 0 && (
            <div className="external-results">
              <div className="results-summary">
                <strong>{externalJobs.length} public listings found</strong>
                <span>Open a source before importing if you want to verify the full posting.</span>
              </div>
              {externalJobs.map((externalJob) => {
                const importedJob = importedJobs[externalJob.externalId];
                const isImporting = importingIds.includes(externalJob.externalId);

                return (
                  <article
                    className={`external-job-card${importedJob ? ' imported' : ''}`}
                    key={externalJob.externalId}
                  >
                    <div className="external-job-content">
                      <div className="external-job-meta">
                        <Pill>{externalJob.sourceName}</Pill>
                        {externalJob.postedAt && <span>{externalJob.postedAt}</span>}
                        {importedJob && <span className="imported-status">Imported</span>}
                      </div>
                      <h3>{externalJob.title}</h3>
                      <p className="external-company">
                        {externalJob.company || 'Company not identified'}
                        {externalJob.location ? ` · ${externalJob.location}` : ''}
                      </p>
                      <p className="external-description">{externalJob.description}</p>
                    </div>
                    <div className="external-job-actions">
                      <a
                        className="secondary button-link"
                        href={externalJob.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View source ↗
                      </a>
                      {importedJob ? (
                        <Link className="primary button-link imported-link" to={`/jobs/${importedJob._id}`}>
                          View role →
                        </Link>
                      ) : (
                        <button
                          className="primary"
                          disabled={isImporting}
                          onClick={() => void importExternalJob(externalJob)}
                        >
                          {isImporting ? 'Importing…' : 'Import role'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {!searching && externalJobs.length === 0 && (
            <div className="external-empty">
              <span>⌕</span>
              <p>Search by role, technology, company, or location.</p>
            </div>
          )}
        </section>
      )}

      <PageState loading={loading} error={error}>
        <div className="card-grid">
          {jobs?.map((job) => (
            <Link className="job-card" key={job._id} to={`/jobs/${job._id}`}>
              <div className="card-topline">
                <div className="job-identity">
                  <span className="job-monogram" aria-hidden="true">{jobMonogram(job)}</span>
                  <div>
                    <strong>{job.company || job.department || 'Engineering'}</strong>
                    <span>{job.source === 'serper' ? 'Imported role' : 'Manual role'}</span>
                  </div>
                </div>
                <span className={`job-status ${job.status}`}>{job.status}</span>
              </div>
              <div className="job-card-body">
                <h2>{job.title}</h2>
                <div className="job-location">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <span>{job.location}</span>
                  <i />
                  <span>{job.employmentType.replace('-', ' ')}</span>
                </div>
                <div className="job-skills">
                  {job.skills.slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}
                  {job.skills.length > 3 && <span className="skill-count">+{job.skills.length - 3}</span>}
                  {job.skills.length === 0 && <span className="skill-placeholder">Skills not specified</span>}
                </div>
              </div>
              <div className="job-card-footer">
                <span className="job-date">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M16 3v4M8 3v4M3 10h18" />
                  </svg>
                  {new Date(job.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
                <span className="pipeline-action">
                  Open pipeline
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </div>
            </Link>
          ))}
          {jobs?.length === 0 && <div className="state-card">Create your first role to begin.</div>}
        </div>
      </PageState>
    </Layout>
  );
}

function TaskBanner({
  task,
  leaving,
  onDone
}: {
  task?: Task;
  leaving: boolean;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!task || task.status === 'completed' || task.status === 'failed') return;
    const timer = window.setTimeout(onDone, 1500);
    return () => window.clearTimeout(timer);
  }, [task, onDone]);
  if (!task) return null;
  return (
    <div className={`task-banner ${task.status}${leaving ? ' leaving' : ''}`}>
      <div>
        <strong>{task.type === 'sourcing' ? 'Candidate sourcing' : 'Outreach'}</strong>
        <span>{task.status} · {task.progress}%</span>
      </div>
      <div className="progress"><span style={{ width: `${task.progress}%` }} /></div>
      {task.error && <small>{task.error}</small>}
    </div>
  );
}

function JobPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const jobState = useAsync(() => api<Job>(`/api/jobs/${id}`), [id]);
  const candidatesState = useAsync(() => api<Candidate[]>(`/api/jobs/${id}/candidates`), [id]);
  const [taskId, setTaskId] = useState('');
  const [task, setTask] = useState<Task>();
  const [taskLeaving, setTaskLeaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [sourcingNotice, setSourcingNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [deletingJob, setDeletingJob] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const pollTask = useCallback(async () => {
    if (!taskId) return;
    try {
      const next = await api<Task>(`/api/tasks/${taskId}`);
      setTask(next);
      if (next.status === 'completed') {
        await candidatesState.reload();
        const discovered = Number(next.result?.discovered ?? 0);
        setSourcingNotice(
          discovered === 0
            ? 'No matching candidates found. Try broadening the role title, skills, or location.'
            : ''
        );
      }
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not load task');
    }
  }, [taskId, candidatesState.reload]);

  useEffect(() => {
    void pollTask();
  }, [pollTask]);

  useEffect(() => {
    if (task?.status !== 'completed') return;
    const leaveTimer = window.setTimeout(() => setTaskLeaving(true), 1400);
    const removeTimer = window.setTimeout(() => {
      setTask(undefined);
      setTaskId('');
      setTaskLeaving(false);
    }, 2050);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, [task?.status]);

  async function sourceCandidates() {
    setActionError('');
    setActionNotice('');
    setSourcingNotice('');
    setTaskLeaving(false);
    try {
      const queued = await api<{ taskId: string }> (`/api/jobs/${id}/sourcing-tasks`, {
        method: 'POST',
        body: JSON.stringify({ limit: 10 })
      });
      setTaskId(queued.taskId);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Unable to start sourcing');
    }
  }

  async function updateJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingJob(true);
    setActionError('');
    setActionNotice('');
    const form = new FormData(event.currentTarget);
    try {
      await api<Job>(`/api/jobs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: form.get('title'),
          department: form.get('department') || undefined,
          location: form.get('location'),
          employmentType: form.get('employmentType'),
          status: form.get('status'),
          description: form.get('description'),
          requirements: String(form.get('requirements') ?? '')
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean),
          skills: String(form.get('skills') ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        })
      });
      await Promise.all([jobState.reload(), candidatesState.reload()]);
      setEditing(false);
      setActionNotice('Job details updated successfully.');
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Unable to update job');
    } finally {
      setSavingJob(false);
    }
  }

  async function deleteJob() {
    if (!jobState.data) return;
    setDeletingJob(true);
    setActionError('');
    setActionNotice('');
    try {
      await api(`/api/jobs/${id}`, { method: 'DELETE' });
      navigate('/');
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Unable to delete job');
      setDeletingJob(false);
      setShowDeleteConfirm(false);
    }
  }

  const isManualJob = !jobState.data?.source || jobState.data.source === 'manual';

  return (
    <Layout>
      <PageState loading={jobState.loading} error={jobState.error}>
        {jobState.data && (
          <>
            <header className="page-header">
              <div>
                <Link className="back-link" to="/">← Roles</Link>
                <h1>{jobState.data.title}</h1>
                <p>{jobState.data.department || 'Engineering'} · {jobState.data.location} · {jobState.data.employmentType}</p>
              </div>
              <div className="job-header-actions">
                {isManualJob && (
                  <>
                    <button className="secondary" onClick={() => setEditing((current) => !current)}>
                      {editing ? 'Close editor' : 'Edit job'}
                    </button>
                    <button
                      className="danger-button"
                      disabled={deletingJob}
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      {deletingJob ? 'Deleting…' : 'Delete'}
                    </button>
                  </>
                )}
                <button className="primary" onClick={sourceCandidates}>Source candidates</button>
              </div>
            </header>
            {actionError && <p className="inline-error">{actionError}</p>}
            {actionNotice && <p className="notice">{actionNotice}</p>}
            {showDeleteConfirm && (
              <div className="modal-backdrop" role="presentation" onClick={() => !deletingJob && setShowDeleteConfirm(false)}>
                <div
                  className="confirm-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="delete-job-title"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="confirm-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h16" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M6 7l1 13h10l1-13" />
                      <path d="M9 7V4h6v3" />
                    </svg>
                  </span>
                  <div>
                    <p className="eyebrow">Confirm deletion</p>
                    <h2 id="delete-job-title">Delete this job?</h2>
                    <p>
                      You’re about to delete <strong>{jobState.data.title}</strong>. This also removes
                      its scores, outreach messages, tasks, and candidate associations.
                    </p>
                  </div>
                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={deletingJob}
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="danger-button solid"
                      disabled={deletingJob}
                      onClick={() => void deleteJob()}
                    >
                      {deletingJob ? 'Deleting…' : 'Yes, delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {sourcingNotice && (
              <div className="sourcing-empty-notice" role="status">
                <span className="sourcing-empty-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="6" />
                    <path d="m16 16 4 4M8.5 11h5" />
                  </svg>
                </span>
                <div>
                  <strong>No matching candidates found</strong>
                  <p>Try broadening the role title, reducing required skills, or using a wider location.</p>
                </div>
                <button type="button" onClick={() => setSourcingNotice('')} aria-label="Dismiss">
                  ×
                </button>
              </div>
            )}
            <TaskBanner task={task} leaving={taskLeaving} onDone={pollTask} />

            {editing && isManualJob && (
              <form className="panel job-edit-form" onSubmit={updateJob}>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Edit manual job</p>
                    <h2>Update role details</h2>
                  </div>
                  <span>Changes are reflected immediately in sourcing and future AI scoring.</span>
                </div>
                <div className="form-grid">
                  <label>
                    Role title
                    <input name="title" required minLength={2} defaultValue={jobState.data.title} />
                  </label>
                  <label>
                    Department
                    <input name="department" defaultValue={jobState.data.department} />
                  </label>
                  <label>
                    Location
                    <input name="location" required defaultValue={jobState.data.location} />
                  </label>
                  <label>
                    Employment
                    <select name="employmentType" defaultValue={jobState.data.employmentType}>
                      <option value="full-time">Full-time</option>
                      <option value="part-time">Part-time</option>
                      <option value="contract">Contract</option>
                      <option value="internship">Internship</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select name="status" defaultValue={jobState.data.status}>
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                  <label>
                    Skills, comma-separated
                    <input name="skills" defaultValue={jobState.data.skills.join(', ')} />
                  </label>
                  <label className="wide">
                    Description
                    <textarea
                      name="description"
                      required
                      minLength={20}
                      rows={5}
                      defaultValue={jobState.data.description}
                    />
                  </label>
                  <label className="wide">
                    Requirements, one per line
                    <textarea
                      name="requirements"
                      rows={4}
                      defaultValue={jobState.data.requirements.join('\n')}
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <button type="button" className="secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                  <button className="primary" disabled={savingJob}>
                    {savingJob ? 'Saving changes…' : 'Save changes'}
                  </button>
                </div>
              </form>
            )}

            <section className="panel role-summary">
              <div>
                <p className="eyebrow">Role brief</p>
                <p>{jobState.data.description}</p>
              </div>
              <div>
                <p className="eyebrow">Core skills</p>
                <div className="skill-row">
                  {jobState.data.skills.map((skill) => <Pill key={skill}>{skill}</Pill>)}
                </div>
              </div>
            </section>

            <section>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Pipeline</p>
                  <h2>Candidates</h2>
                </div>
                <span>{candidatesState.data?.length ?? 0} profiles</span>
              </div>
              <CandidateTable
                candidates={candidatesState.data ?? []}
                loading={candidatesState.loading}
                error={candidatesState.error}
                jobId={id}
              />
            </section>
          </>
        )}
      </PageState>
    </Layout>
  );
}

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined) return <span className="score empty">—</span>;
  const tone = score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low';
  return (
    <span
      className={`score ${tone}`}
      style={{ '--score-progress': `${Math.max(0, Math.min(score, 100)) * 3.6}deg` } as CSSProperties}
      aria-label={`Match score ${score} out of 100`}
    >
      <span>{score}</span>
    </span>
  );
}

function CandidateTable({
  candidates,
  loading,
  error,
  jobId
}: {
  candidates: Candidate[];
  loading: boolean;
  error: string;
  jobId?: string;
}) {
  return (
    <PageState loading={loading} error={error}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Candidate</th><th>Status</th><th>Skills</th><th>Match</th><th /></tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr key={candidate._id}>
                <td>
                  <strong>{candidate.name}</strong>
                  <span>{candidate.headline || candidate.location || 'Professional profile'}</span>
                </td>
                <td><Pill tone={candidate.status === 'interested' ? 'success' : ''}>{candidate.status.replace('_', ' ')}</Pill></td>
                <td><div className="skill-row compact">{candidate.skills.slice(0, 3).map((skill) => <Pill key={skill}>{skill}</Pill>)}</div></td>
                <td><ScoreBadge score={candidate.latestScore?.score} /></td>
                <td><Link className="text-link" to={`/candidates/${candidate._id}${jobId ? `?job=${jobId}` : ''}`}>View →</Link></td>
              </tr>
            ))}
            {candidates.length === 0 && <tr><td colSpan={5} className="empty-row">No candidates yet. Start sourcing to fill the pipeline.</td></tr>}
          </tbody>
        </table>
      </div>
    </PageState>
  );
}

function CandidatesPage() {
  const state = useAsync(() => api<Candidate[]>('/api/candidates'), []);
  return (
    <Layout>
      <header className="page-header">
        <div><p className="eyebrow">Talent network</p><h1>All candidates</h1><p>Deduplicated profiles across every active role.</p></div>
      </header>
      <CandidateTable candidates={state.data ?? []} loading={state.loading} error={state.error} />
    </Layout>
  );
}

function CandidatePage() {
  const { id = '' } = useParams();
  const state = useAsync(() => api<Candidate>(`/api/candidates/${id}`), [id]);
  const [selectedJob, setSelectedJob] = useState('');
  const [working, setWorking] = useState('');
  const [outreachTaskId, setOutreachTaskId] = useState('');
  const [feedbackToast, setFeedbackToast] = useState<FeedbackToast>();
  const [response, setResponse] = useState('');

  useEffect(() => {
    if (!feedbackToast) return;
    const timer = window.setTimeout(() => setFeedbackToast(undefined), 4200);
    return () => window.clearTimeout(timer);
  }, [feedbackToast]);

  function showFeedbackToast(toast: FeedbackToast) {
    setFeedbackToast(toast);
  }

  useEffect(() => {
    if (!selectedJob && state.data?.jobs?.[0]) setSelectedJob(state.data.jobs[0]._id);
  }, [state.data, selectedJob]);

  useEffect(() => {
    if (!outreachTaskId) return;
    let cancelled = false;
    let timer: number | undefined;

    async function pollOutreachTask() {
      try {
        const task = await api<Task>(`/api/tasks/${outreachTaskId}`);
        if (cancelled) return;

        if (task.status === 'completed') {
          setOutreachTaskId('');
          await state.reload();
          return;
        }

        if (task.status === 'failed') {
          setOutreachTaskId('');
          setFeedbackToast({
            tone: 'error',
            message: task.error || 'Outreach failed'
          });
          return;
        }

        timer = window.setTimeout(() => void pollOutreachTask(), 1000);
      } catch (caught) {
        if (cancelled) return;
        setOutreachTaskId('');
        setFeedbackToast({
          tone: 'error',
          message: caught instanceof Error ? caught.message : 'Could not check outreach status'
        });
      }
    }

    void pollOutreachTask();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [outreachTaskId, state.reload]);

  async function score() {
    setWorking('score'); setFeedbackToast(undefined);
    try {
      const result = await api<Score>(`/api/candidates/${id}/scores`, {
        method: 'POST', body: JSON.stringify({ jobId: selectedJob })
      });
      showFeedbackToast({ tone: 'success', message: `Scored ${result.score}/100` });
      await state.reload();
    } catch (caught) {
      showFeedbackToast({
        tone: 'error',
        message: caught instanceof Error ? caught.message : 'Scoring failed'
      });
    }
    finally { setWorking(''); }
  }

  async function outreach() {
    setWorking('outreach'); setFeedbackToast(undefined);
    try {
      const result = await api<{ taskId: string }>(`/api/candidates/${id}/outreach`, {
        method: 'POST', body: JSON.stringify({ jobId: selectedJob })
      });
      setOutreachTaskId(result.taskId);
      showFeedbackToast({ tone: 'success', message: 'Outreach triggered' });
      await state.reload();
    } catch (caught) {
      showFeedbackToast({
        tone: 'error',
        message: caught instanceof Error ? caught.message : 'Outreach failed'
      });
    }
    finally { setWorking(''); }
  }

  async function classify(event: FormEvent) {
    event.preventDefault();
    setWorking('response'); setFeedbackToast(undefined);
    try {
      const result = await api<{ intent: string; schedulingLink?: string }>(`/api/candidates/${id}/responses`, {
        method: 'POST', body: JSON.stringify({ message: response })
      });
      showFeedbackToast({
        tone: 'success',
        message: `Intent: ${result.intent}${result.schedulingLink ? ' · Mock interview link generated' : ''}`,
        actionHref: result.schedulingLink,
        actionLabel: result.schedulingLink ? 'Open link ↗' : undefined
      });
      setResponse('');
      await state.reload();
    } catch (caught) {
      showFeedbackToast({
        tone: 'error',
        message: caught instanceof Error ? caught.message : 'Classification failed'
      });
    }
    finally { setWorking(''); }
  }

  const activeScore = state.data?.scores?.find((item) => item.jobId === selectedJob);

  return (
    <Layout>
      <FloatingToast toast={feedbackToast} onDismiss={() => setFeedbackToast(undefined)} />
      <PageState loading={state.loading} error={state.error}>
        {state.data && (
          <>
            <header className="page-header">
              <div><Link className="back-link" to="/candidates">← Candidates</Link><h1>{state.data.name}</h1><p>{state.data.headline || 'Candidate profile'} · {state.data.location || 'Location unavailable'}</p></div>
              <a className="secondary button-link" href={state.data.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn ↗</a>
            </header>
            <div className="detail-grid">
              <section className="panel">
                <p className="eyebrow">Profile</p>
                <p>{state.data.summary || 'No profile summary was provided by the sourcing provider.'}</p>
                <div className="skill-row">{state.data.skills.map((skill) => <Pill key={skill}>{skill}</Pill>)}</div>
                <dl>
                  <div><dt>Experience</dt><dd>{state.data.experienceYears ? `${state.data.experienceYears} years` : 'Unknown'}</dd></div>
                  <div><dt>Source</dt><dd>{state.data.source}</dd></div>
                  <div><dt>Status</dt><dd>{state.data.status.replace('_', ' ')}</dd></div>
                </dl>
              </section>
              <section className="panel action-panel">
                <p className="eyebrow">Automation</p>
                <label>Role<select value={selectedJob} onChange={(event) => setSelectedJob(event.target.value)}>{state.data.jobs?.map((job) => <option key={job._id} value={job._id}>{job.title}</option>)}</select></label>
                <div className="action-row">
                  <button className="primary" disabled={!selectedJob || Boolean(working)} onClick={score}>{working === 'score' ? 'Scoring…' : 'Score match'}</button>
                  <button className="secondary" disabled={!selectedJob || Boolean(working)} onClick={outreach}>{working === 'outreach' ? 'Queuing…' : 'Trigger outreach'}</button>
                </div>
                {activeScore && <div className="score-card"><ScoreBadge score={activeScore.score} /><div><strong>{activeScore.recommendation.replace('_', ' ')}</strong><p>{activeScore.reasoning}</p></div></div>}
              </section>
            </div>
            <div className="detail-grid lower">
              <section className="panel">
                <p className="eyebrow">Messages</p>
                <div className="timeline">{state.data.messages?.map((message) => <div key={message._id}><Pill tone={message.status === 'sent' ? 'success' : ''}>{message.status}</Pill><p>{message.body}</p><small>{new Date(message.createdAt).toLocaleString()}</small></div>)}{state.data.messages?.length === 0 && <p className="muted">No outreach yet.</p>}</div>
              </section>
              <form className="panel" onSubmit={classify}>
                <p className="eyebrow">Simulate response</p>
                <textarea rows={5} required value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Yes, I’d love to learn more." />
                <button className="primary" disabled={Boolean(working)}>{working === 'response' ? 'Classifying…' : 'Classify intent'}</button>
              </form>
            </div>
            <section className="panel response-history">
              <div className="response-history-header">
                <div>
                  <p className="eyebrow">Candidate responses</p>
                  <h2>Response activity</h2>
                  <p>AI-classified replies and generated interview actions.</p>
                </div>
                <span className="response-count">
                  {state.data.responses?.length ?? 0}{' '}
                  {(state.data.responses?.length ?? 0) === 1 ? 'response' : 'responses'}
                </span>
              </div>
              <div className="response-list">
                {state.data.responses?.map((candidateResponse) => (
                  <article className="response-item" key={candidateResponse._id}>
                    <div
                      className={`response-intent-icon ${
                        candidateResponse.intent === 'interested' ? 'positive' : 'negative'
                      }`}
                      aria-hidden="true"
                    >
                      {candidateResponse.intent === 'interested' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m5 12 4 4L19 6" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m6 6 12 12M18 6 6 18" />
                        </svg>
                      )}
                    </div>
                    <div className="response-item-content">
                      <div className="response-item-topline">
                        <Pill tone={candidateResponse.intent === 'interested' ? 'success' : ''}>
                          {candidateResponse.intent.replace('_', ' ')}
                        </Pill>
                        <time dateTime={candidateResponse.createdAt}>
                          {new Date(candidateResponse.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                          {' · '}
                          {new Date(candidateResponse.createdAt).toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </time>
                      </div>
                      <blockquote>“{candidateResponse.message}”</blockquote>
                      {candidateResponse.schedulingLink && (
                        <a
                          className="interview-link"
                          href={candidateResponse.schedulingLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="5" width="18" height="16" rx="2" />
                              <path d="M16 3v4M8 3v4M3 10h18" />
                            </svg>
                            Interview scheduling link
                          </span>
                          <span aria-hidden="true">↗</span>
                        </a>
                      )}
                    </div>
                  </article>
                ))}
                {state.data.responses?.length === 0 && (
                  <div className="response-empty">
                    <span aria-hidden="true">↩</span>
                    <p>No candidate responses have been recorded yet.</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </PageState>
    </Layout>
  );
}

function NotFound() {
  return <Layout><div className="state-card"><h1>Page not found</h1><Link to="/">Return to jobs</Link></div></Layout>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<JobsPage />} />
      <Route path="/jobs/:id" element={<JobPage />} />
      <Route path="/candidates" element={<CandidatesPage />} />
      <Route path="/candidates/:id" element={<CandidatePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
