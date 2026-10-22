
"use client";

import { useEffect, useState, type FormEvent } from "react";

const API = "http://127.0.0.1:8000";

const jobs = [
  { company: "Stripe", role: "Software Engineer", type: "Full-time", location: "Bengaluru, India", match: 94, color: "#635BFF" },
  { company: "Atlassian", role: "AI Engineer", type: "Full-time", location: "Remote · India", match: 89, color: "#1868DB" },
  { company: "Cisco", role: "Software Engineer Trainee", type: "Apprenticeship", location: "Bengaluru, India", match: 87, color: "#049FD9" },
];

const navItems = [
  { name: "Overview", icon: "◫" },
  { name: "Find jobs", icon: "⌕" },
  { name: "My applications", icon: "▤" },
  { name: "My Profile", icon: "◉" },
  { name: "Resume studio", icon: "▧" },
];

const statuses = [
  "Saved",
  "Ready to review",
  "Applied",
  "In review",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
];

type Job = (typeof jobs)[number];

type Application = {
  id: number;
  company: string;
  job_title: string;
  status: string;
  job_url: string | null;
  notes: string | null;
  created_at: string;
};

type Profile = {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  skills: string;
  experience: string;
  preferred_roles: string;
};

type Resume = {
  id: number;
  filename: string;
  extracted_text: string;
  uploaded_at?: string | null;
  character_count?: number;
};

const emptyProfile: Profile = {
  full_name: "",
  email: "",
  phone: "",
  location: "",
  headline: "",
  skills: "",
  experience: "",
  preferred_roles: "",
};

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return typeof data.detail === "string"
      ? data.detail
      : "The request could not be completed.";
  } catch {
    return `Request failed (${response.status}).`;
  }
}

function formatDate(value: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [resume, setResume] = useState<Resume | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [busyApplication, setBusyApplication] = useState<number | null>(null);
  const [resumeTextVisible, setResumeTextVisible] = useState(true);

  const filteredJobs = jobs.filter((job) =>
    `${job.company} ${job.role} ${job.location}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  async function loadApplications() {
    const response = await fetch(`${API}/applications`, { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    setApplications(await response.json());
  }

  async function loadProfile() {
    const response = await fetch(`${API}/profile`, { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    setProfile({
      full_name: data.full_name ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      location: data.location ?? "",
      headline: data.headline ?? "",
      skills: data.skills ?? "",
      experience: data.experience ?? "",
      preferred_roles: data.preferred_roles ?? "",
    });
  }

  async function loadResume() {
    const response = await fetch(`${API}/resume/latest`, { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    setResume(data);
  }

  async function refreshAll() {
    setLoading(true);
    setError("");

    try {
      await Promise.all([loadApplications(), loadProfile(), loadResume()]);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Make sure the FastAPI backend is running on port 8000.`
          : "Could not connect to the backend."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  function showError(message: string) {
    setError(message);
    setNotice("");
  }

  function showNotice(message: string) {
    setNotice(message);
    setError("");
  }

  function updateProfileField(field: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

      if (!response.ok) throw new Error(await readError(response));

      const updated = await response.json();
      setProfile({
        full_name: updated.full_name ?? "",
        email: updated.email ?? "",
        phone: updated.phone ?? "",
        location: updated.location ?? "",
        headline: updated.headline ?? "",
        skills: updated.skills ?? "",
        experience: updated.experience ?? "",
        preferred_roles: updated.preferred_roles ?? "",
      });
      showNotice("Your profile has been saved to your local database.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const input = form.elements.namedItem("resume") as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file) {
      showError("Choose a PDF or DOCX resume first.");
      return;
    }

    const allowed = /\.(pdf|docx)$/i.test(file.name);
    if (!allowed) {
      showError("Only PDF and DOCX files are supported.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError("Your resume must be 5 MB or smaller.");
      return;
    }

    const data = new FormData();
    data.append("file", file);
    setUploadingResume(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API}/resume`, {
        method: "POST",
        body: data,
      });

      if (!response.ok) throw new Error(await readError(response));

      const result: Resume = await response.json();
      setResume(result);
      setResumeTextVisible(true);
      form.reset();
      showNotice("Resume uploaded and text extracted successfully on your computer.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Resume upload failed.");
    } finally {
      setUploadingResume(false);
    }
  }

  async function addApplication(job: Pick<Job, "company" | "role">) {
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: job.company,
          job_title: job.role,
          status: "Saved",
          job_url: null,
          notes: "Added from JobZen's sample job catalogue. Verify the vacancy before applying.",
        }),
      });

      if (response.status === 409) {
        showNotice(`${job.company} — ${job.role} is already in your tracker.`);
        setActive("My applications");
        return;
      }

      if (!response.ok) throw new Error(await readError(response));

      await loadApplications();
      setActive("My applications");
      showNotice(`${job.company} was added to your tracker. No application was submitted.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not add this application.");
    }
  }

  async function updateApplicationStatus(app: Application, status: string) {
    setBusyApplication(app.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API}/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: app.notes }),
      });

      if (!response.ok) throw new Error(await readError(response));

      const updated: Application = await response.json();
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      showNotice(`Status updated to "${status}".`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setBusyApplication(null);
    }
  }

  async function deleteApplication(app: Application) {
    if (!window.confirm(`Remove ${app.company} — ${app.job_title} from your tracker?`)) {
      return;
    }

    setBusyApplication(app.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API}/applications/${app.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error(await readError(response));

      setApplications((current) => current.filter((item) => item.id !== app.id));
      showNotice("Application removed from your tracker.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not delete application.");
    } finally {
      setBusyApplication(null);
    }
  }

  function toggleSaved(company: string) {
    setSaved((current) =>
      current.includes(company)
        ? current.filter((name) => name !== company)
        : [...current, company]
    );
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";

  const labelClass = "block text-sm font-medium text-slate-700";

  const cardClass =
    "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7";

  return (
    <main className="min-h-screen bg-[#F7F8FC] text-slate-900 md:flex">
      <aside className="flex w-full shrink-0 flex-col bg-[#111322] px-5 py-6 text-white md:sticky md:top-0 md:h-screen md:w-[248px]">
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500 text-xl font-bold shadow-lg shadow-violet-500/30">
            J
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">JobZen</div>
            <div className="text-xs text-slate-400">AI career workspace</div>
          </div>
        </div>

        <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Workspace
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={() => {
                setActive(item.name);
                setNotice("");
                setError("");
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                active === item.name
                  ? "bg-violet-500/15 font-medium text-violet-300 ring-1 ring-violet-400/20"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="w-5 text-center text-lg">{item.icon}</span>
              {item.name}
              {item.name === "My applications" && (
                <span className="ml-auto rounded-md bg-white/10 px-2 py-0.5 text-xs">
                  {applications.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:block">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-300/10 text-lg">
            ✦
          </div>
          <div className="text-sm font-medium">Your next chapter</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Small steps, meaningful progress. Keep your career moving.
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[65%] rounded-full bg-violet-400" />
          </div>
        </div>
      </aside>

      <section className="min-w-0 flex-1 px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
        <header className="mb-9 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-violet-600">
              Your career, in focus
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {active === "Overview" ? "Your career dashboard" : active}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {active === "Overview"
                ? "A clearer path from job search to your next opportunity."
                : `Manage your ${active.toLowerCase()} workspace.`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium">
                {profile.full_name || "My workspace"}
              </div>
              <div className="text-xs text-slate-500">
                {profile.headline || "Your career workspace"}
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E7E2FF] text-sm font-semibold text-violet-700">
              {profile.full_name
                ? profile.full_name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("")
                : "ME"}
            </div>
          </div>
        </header>

        {notice && (
          <div
            role="status"
            className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss notification">
              ✕
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className={cardClass}>
            <p className="text-sm text-slate-500">Loading your local JobZen data…</p>
          </div>
        ) : (
          <>
            {active === "My Profile" && (
              <div className="max-w-4xl space-y-5">
                <div className={cardClass}>
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold">Your professional profile</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Edit your details and save them to your local database.
                    </p>
                  </div>

                  <form onSubmit={saveProfile} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className={labelClass}>
                        Full name
                        <input
                          className={inputClass}
                          value={profile.full_name}
                          onChange={(e) => updateProfileField("full_name", e.target.value)}
                          placeholder="Your full name"
                          autoComplete="name"
                        />
                      </label>
                      <label className={labelClass}>
                        Email
                        <input
                          type="email"
                          className={inputClass}
                          value={profile.email}
                          onChange={(e) => updateProfileField("email", e.target.value)}
                          placeholder="you@example.com"
                          autoComplete="email"
                        />
                      </label>
                      <label className={labelClass}>
                        Phone
                        <input
                          className={inputClass}
                          value={profile.phone}
                          onChange={(e) => updateProfileField("phone", e.target.value)}
                          placeholder="Phone number"
                          autoComplete="tel"
                        />
                      </label>
                      <label className={labelClass}>
                        Location
                        <input
                          className={inputClass}
                          value={profile.location}
                          onChange={(e) => updateProfileField("location", e.target.value)}
                          placeholder="City, country"
                          autoComplete="address-level2"
                        />
                      </label>
                    </div>

                    <label className={labelClass}>
                      Professional headline
                      <input
                        className={inputClass}
                        value={profile.headline}
                        onChange={(e) => updateProfileField("headline", e.target.value)}
                        placeholder="e.g. Software Engineer | AI & Backend"
                      />
                    </label>

                    <label className={labelClass}>
                      Skills
                      <textarea
                        className={inputClass}
                        rows={3}
                        value={profile.skills}
                        onChange={(e) => updateProfileField("skills", e.target.value)}
                        placeholder="Python, Java, FastAPI, SQL, React..."
                      />
                    </label>

                    <label className={labelClass}>
                      Experience and education
                      <textarea
                        className={inputClass}
                        rows={5}
                        value={profile.experience}
                        onChange={(e) => updateProfileField("experience", e.target.value)}
                        placeholder="Add your roles, projects, education and achievements..."
                      />
                    </label>

                    <label className={labelClass}>
                      Preferred job roles
                      <input
                        className={inputClass}
                        value={profile.preferred_roles}
                        onChange={(e) => updateProfileField("preferred_roles", e.target.value)}
                        placeholder="AI Engineer, Software Engineer, Backend Developer..."
                      />
                    </label>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="rounded-xl bg-[#17172B] px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
                      >
                        {savingProfile ? "Saving…" : "Save profile"}
                      </button>
                      <span className="text-xs text-slate-400">
                        Your profile is stored locally in SQLite.
                      </span>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {active === "Resume studio" && (
              <div className="max-w-4xl space-y-5">
                <div className={cardClass}>
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-2xl text-violet-600">
                    ▧
                  </div>
                  <h2 className="text-xl font-semibold">Resume studio</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Upload a PDF or DOCX resume. JobZen extracts readable text on your
                    computer so you can inspect it before using it in later features.
                  </p>

                  <form
                    onSubmit={uploadResume}
                    className="mt-6 rounded-xl border-2 border-dashed border-slate-200 p-5 sm:p-8"
                  >
                    <label className="block text-sm font-medium text-slate-700">
                      Choose resume (PDF or DOCX, up to 5 MB)
                      <input
                        key={resume?.id ?? "resume-input"}
                        type="file"
                        name="resume"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="mt-3 block w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-violet-50 file:px-4 file:py-2 file:font-medium file:text-violet-700"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={uploadingResume}
                      className="mt-4 rounded-xl bg-[#17172B] px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
                    >
                      {uploadingResume ? "Uploading and extracting…" : "Upload and extract text"}
                    </button>
                  </form>

                  <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                    <strong>Privacy:</strong> the file is saved in your local backend
                    uploads folder, and its extracted text is saved in your local SQLite
                    database. It is not sent to an external AI service by this feature.
                  </div>
                </div>

                {resume && (
                  <div className={cardClass}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">Uploaded resume</h2>
                        <p className="mt-1 break-all text-sm text-slate-500">
                          {resume.filename}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {resume.character_count ?? resume.extracted_text.length} characters extracted
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setResumeTextVisible((visible) => !visible)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      >
                        {resumeTextVisible ? "Hide text" : "Show extracted text"}
                      </button>
                    </div>
                    {resumeTextVisible && (
                      <pre className="mt-5 max-h-[500px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                        {resume.extracted_text}
                      </pre>
                    )}
                  </div>
                )}

                {!resume && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                    No resume uploaded yet. After uploading, your extracted text will appear here.
                  </div>
                )}
              </div>
            )}

            {active === "My applications" && (
              <div className={cardClass}>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Application tracker</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      These entries come from your SQLite database, not demo records.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadApplications().catch((err) => showError(String(err)))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                  >
                    Refresh
                  </button>
                </div>

                {applications.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                    <div className="text-3xl">▤</div>
                    <h3 className="mt-3 font-semibold">No applications yet</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Add a role from Find jobs or create an application in the API docs.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActive("Find jobs")}
                      className="mt-4 rounded-xl bg-[#17172B] px-4 py-2.5 text-sm font-medium text-white"
                    >
                      Explore sample jobs
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {applications.map((app) => (
                      <article
                        key={app.id}
                        className="rounded-xl border border-slate-100 p-4 sm:p-5"
                      >
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-sm font-bold text-violet-800">
                            {app.company?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold">{app.job_title}</h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {app.company} · Added {formatDate(app.created_at)}
                            </p>
                            {app.job_url && (
                              <a
                                href={app.job_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-block text-sm text-violet-700 underline"
                              >
                                View job posting
                              </a>
                            )}
                            {app.notes && (
                              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">
                                {app.notes}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={busyApplication === app.id}
                            onClick={() => void deleteApplication(app)}
                            className="rounded-lg border border-red-100 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                          <label className="text-xs font-medium text-slate-500">
                            Application status
                            <select
                              value={app.status}
                              disabled={busyApplication === app.id}
                              onChange={(e) =>
                                void updateApplicationStatus(app, e.target.value)
                              }
                              className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                            >
                              {!statuses.includes(app.status) && (
                                <option value={app.status}>{app.status}</option>
                              )}
                              {statuses.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </label>
                          {busyApplication === app.id && (
                            <span className="text-xs text-slate-400">Saving…</span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {active === "Find jobs" && (
              <div className={cardClass}>
                <h2 className="text-lg font-semibold">Search opportunities</h2>
                <p className="mt-1 text-sm text-slate-500">
                  These are sample listings for testing the tracker, not verified live vacancies.
                </p>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title, company, or location..."
                  className={inputClass}
                />

                <div className="mt-5 space-y-3">
                  {filteredJobs.map((job) => (
                    <div
                      key={`${job.company}-${job.role}`}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-4"
                    >
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                        style={{ backgroundColor: job.color }}
                      >
                        {job.company[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium">{job.role}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {job.company} · {job.location}
                        </p>
                        <div className="mt-1 text-xs text-slate-400">
                          {job.type} · Illustrative {job.match}% match
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void addApplication(job)}
                        className="rounded-xl bg-[#17172B] px-4 py-2.5 text-xs font-medium text-white hover:bg-violet-800"
                      >
                        Add to tracker
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSaved(job.company)}
                        className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        {saved.includes(job.company) ? "♥ Saved" : "♡ Save job"}
                      </button>
                    </div>
                  ))}
                  {filteredJobs.length === 0 && (
                    <p className="py-5 text-sm text-slate-500">
                      No sample jobs match that search. Try another keyword.
                    </p>
                  )}
                </div>
                <p className="mt-4 text-xs text-slate-400">
                  Saved-job selections currently last for this browser session.
                </p>
              </div>
            )}

            {active === "Overview" && (
              <>
                <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
                  {[
                    {
                      label: "Jobs available",
                      value: String(jobs.length),
                      note: "Sample listings",
                      icon: "⌕",
                      bg: "bg-blue-50",
                      color: "text-blue-600",
                    },
                    {
                      label: "Saved jobs",
                      value: String(saved.length),
                      note: "This browser session",
                      icon: "♡",
                      bg: "bg-violet-50",
                      color: "text-violet-600",
                    },
                    {
                      label: "Applications",
                      value: String(applications.length),
                      note: "From SQLite",
                      icon: "▤",
                      bg: "bg-emerald-50",
                      color: "text-emerald-600",
                    },
                    {
                      label: "Interviews",
                      value: String(applications.filter((a) => a.status === "Interview").length),
                      note: "From your tracker",
                      icon: "✳",
                      bg: "bg-amber-50",
                      color: "text-amber-600",
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5"
                    >
                      <div className={`mb-5 flex h-10 w-10 items-center justify-center rounded-xl text-xl ${stat.bg} ${stat.color}`}>
                        {stat.icon}
                      </div>
                      <div className="text-2xl font-semibold tracking-tight">{stat.value}</div>
                      <div className="mt-1 text-sm font-medium text-slate-600">{stat.label}</div>
                      <div className="mt-2 text-[11px] text-slate-400">{stat.note}</div>
                    </div>
                  ))}
                </div>

                <div className="mb-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                  <div className="rounded-2xl bg-gradient-to-br from-[#252044] via-[#34285E] to-[#5A42A6] p-6 text-white shadow-lg shadow-violet-900/10 sm:p-8">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-violet-100">
                      <span className="text-amber-300">✦</span> YOUR CAREER WORKSPACE
                    </div>
                    <h2 className="max-w-md text-2xl font-semibold leading-tight sm:text-3xl">
                      Your next opportunity starts with one smart move.
                    </h2>
                    <p className="mt-3 max-w-lg text-sm leading-6 text-violet-100/80">
                      Keep your profile ready, review your resume, and track every application on your terms.
                    </p>
                    <div className="mt-7 flex flex-wrap gap-3">
                      <button
                        onClick={() => setActive("Find jobs")}
                        className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#34285E] hover:bg-violet-50"
                      >
                        Explore sample jobs →
                      </button>
                      <button
                        onClick={() => setActive("My Profile")}
                        className="rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                      >
                        Edit my profile
                      </button>
                    </div>
                    <div className="mt-8 flex flex-wrap gap-2 text-xs text-violet-100/80">
                      <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2">Resume review</span>
                      <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2">Application tracking</span>
                      <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2">You approve submissions</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                    <h2 className="font-semibold">Your workspace</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Your saved information at a glance
                    </p>
                    <div className="mt-6 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">Profile</span>
                        <span className={`text-xs font-medium ${profile.full_name ? "text-emerald-700" : "text-amber-700"}`}>
                          {profile.full_name ? "Started" : "Not completed"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">Resume</span>
                        <span className={`text-xs font-medium ${resume ? "text-emerald-700" : "text-amber-700"}`}>
                          {resume ? "Uploaded" : "Not uploaded"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">Tracked applications</span>
                        <span className="text-sm font-semibold">{applications.length}</span>
                      </div>
                    </div>
                    <div className="mt-6 space-y-2">
                      <button
                        onClick={() => setActive("My Profile")}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium hover:bg-slate-50"
                      >
                        ◉ &nbsp; Edit my profile →
                      </button>
                      <button
                        onClick={() => setActive("Resume studio")}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium hover:bg-slate-50"
                      >
                        ▧ &nbsp; Upload a resume →
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.15em] text-violet-600">
                      Sample catalogue
                    </div>
                    <h2 className="mt-1 text-xl font-semibold">Discover opportunities</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Example roles to try out your application tracker.
                    </p>
                  </div>
                  <button
                    onClick={() => setActive("Find jobs")}
                    className="text-sm font-medium text-violet-700 hover:text-violet-900"
                  >
                    View all jobs →
                  </button>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  {jobs.map((job) => (
                    <article
                      key={job.company}
                      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="mb-5 flex items-start justify-between">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
                          style={{ backgroundColor: job.color }}
                        >
                          {job.company[0]}
                        </div>
                        <button
                          onClick={() => toggleSaved(job.company)}
                          aria-label={`Save ${job.company}`}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-lg hover:bg-slate-50"
                        >
                          {saved.includes(job.company) ? "♥" : "♡"}
                        </button>
                      </div>
                      <div className="text-xs font-medium text-slate-500">{job.company}</div>
                      <h3 className="mt-1 font-semibold">{job.role}</h3>
                      <div className="mt-2 text-xs text-slate-500">{job.location}</div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600">{job.type}</span>
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">{job.match}% illustrative match</span>
                      </div>
                      <button
                        onClick={() => void addApplication(job)}
                        className="mt-5 w-full rounded-xl bg-[#17172B] px-3 py-2.5 text-xs font-medium text-white hover:bg-violet-800"
                      >
                        Add to tracker
                      </button>
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <footer className="mt-10 border-t border-slate-200 py-5 text-xs text-slate-400">
          JobZen · Local career workspace · Review every application before submitting.
        </footer>
      </section>
    </main>
  );
}
