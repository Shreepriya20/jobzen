
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

const API = "http://127.0.0.1:8000";

const STATUSES = [
  "Saved",
  "Ready to review",
  "Applied",
  "In review",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
];


const NAV = [
  { name: "Overview", icon: "◫" },
  { name: "Find jobs", icon: "⌕" },
  { name: "My applications", icon: "▤" },
  { name: "My Profile", icon: "◉" },
  { name: "Resume studio", icon: "▧" },
  { name: "Resume Match", icon: "◎" },
];


type Application = {
  id: number;
  company: string;
  job_title: string;
  status: string;
  job_url: string | null;
  notes: string | null;
  created_at: string;
};

type LiveJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  employment_type: string;
  description: string;
  url: string;
  source: string;
  match_score: number;
  matched_skills: string[];
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

const EMPTY_PROFILE: Profile = {
  full_name: "",
  email: "",
  phone: "",
  location: "",
  headline: "",
  skills: "",
  experience: "",
  preferred_roles: "",
};

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";

const labelClass = "block text-sm font-medium text-slate-700";

const cardClass =
  "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7";

async function errorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return typeof data.detail === "string"
      ? data.detail
      : "The request could not be completed.";
  } catch {
    return `Request failed (${response.status}).`;
  }
}

function dateLabel(value: string) {
  if (!value) return "Date unavailable";
  const date = new Date(
    value.includes("T") ? value : value.replace(" ", "T") + "Z"
  );
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input
        className={inputClass}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

export default function Home() {
  const [active, setActive] = useState("Overview");
  
const [matchJobTitle, setMatchJobTitle] = useState("");
const [matchCompany, setMatchCompany] = useState("");
const [matchDescription, setMatchDescription] = useState("");
const [matchResult, setMatchResult] = useState<any>(null);
const [matchLoading, setMatchLoading] = useState(false);
const [matchError, setMatchError] = useState("");

  const [collapsed, setCollapsed] = useState(false);

  const [applications, setApplications] = useState<Application[]>([]);
  
  const [liveJobs, setLiveJobs] = useState<LiveJob[]>([]);
  const [liveQuery, setLiveQuery] = useState("software engineer");
  const [liveCountry, setLiveCountry] = useState("India");
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveSuccess, setLiveSuccess] = useState("");
  const [liveSearched, setLiveSearched] = useState(false);
  const [savingLiveJob, setSavingLiveJob] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [resume, setResume] = useState<Resume | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [resumeVisible, setResumeVisible] = useState(true);

  const [jobSearch, setJobSearch] = useState("");
  const [jobStatus, setJobStatus] = useState("All");
  const [appSearch, setAppSearch] = useState("");
  const [appStatus, setAppStatus] = useState("All");

  const [jobForm, setJobForm] = useState({
    company: "",
    job_title: "",
    job_url: "",
    notes: "",
  });

  const notify = (message: string) => {
    setNotice(message);
    setError("");
  };

  const fail = (message: string) => {
    setError(message);
    setNotice("");
  };

  const loadApplications = useCallback(async () => {
    const response = await fetch(`${API}/applications`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const data = await response.json();
    setApplications(Array.isArray(data) ? data : []);
  }, []);

  const loadProfile = useCallback(async () => {
    const response = await fetch(`${API}/profile`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await errorMessage(response));
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
  }, []);

  const loadResume = useCallback(async () => {
    const response = await fetch(`${API}/resume/latest`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const data = await response.json();
    setResume(data ?? null);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadApplications(), loadProfile(), loadResume()]);
    } catch (err) {
      fail(
        `${err instanceof Error ? err.message : "Could not load JobZen data."} Check that the backend is running on port 8000.`
      );
    } finally {
      setLoading(false);
    }
  }, [loadApplications, loadProfile, loadResume]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const savedCount = applications.filter((a) => a.status === "Saved").length;
  const activeCount = applications.filter(
    (a) => !["Rejected", "Withdrawn"].includes(a.status)
  ).length;
  const interviewCount = applications.filter(
    (a) => a.status === "Interview"
  ).length;
  const offerCount = applications.filter((a) => a.status === "Offer").length;

  const filteredJobs = useMemo(() => {
    const term = jobSearch.trim().toLowerCase();
    return applications.filter((job) => {
      const matchesSearch =
        !term ||
        `${job.company} ${job.job_title} ${job.job_url ?? ""} ${job.notes ?? ""}`
          .toLowerCase()
          .includes(term);
      const matchesStatus =
        jobStatus === "All" || job.status === jobStatus;
      return matchesSearch && matchesStatus;
    });
  }, [applications, jobSearch, jobStatus]);

  const filteredApplications = useMemo(() => {
    const term = appSearch.trim().toLowerCase();
    return applications.filter((app) => {
      const matchesSearch =
        !term ||
        `${app.company} ${app.job_title} ${app.notes ?? ""}`
          .toLowerCase()
          .includes(term);
      const matchesStatus =
        appStatus === "All" || app.status === appStatus;
      return matchesSearch && matchesStatus;
    });
  }, [applications, appSearch, appStatus]);

  function updateProfile(field: keyof Profile, value: string) {
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
      if (!response.ok) throw new Error(await errorMessage(response));

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
      notify("Profile saved successfully.");
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function addJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const company = jobForm.company.trim();
    const jobTitle = jobForm.job_title.trim();

    if (!company || !jobTitle) {
      fail("Company and job title are required.");
      return;
    }

    if (jobForm.job_url.trim()) {
      try {
        const url = new URL(jobForm.job_url.trim());
        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error();
        }
      } catch {
        fail("Enter a valid job link beginning with https:// or http://.");
        return;
      }
    }

    try {
      const response = await fetch(`${API}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          job_title: jobTitle,
          status: "Saved",
          job_url: jobForm.job_url.trim() || null,
          notes: jobForm.notes.trim() || null,
        }),
      });

      if (response.status === 409) {
        fail("This company and role may already exist in your tracker.");
        return;
      }
      if (!response.ok) throw new Error(await errorMessage(response));

      await loadApplications();
      setJobForm({ company: "", job_title: "", job_url: "", notes: "" });
      notify("Job saved to your tracker. No application was submitted.");
      setActive("My applications");
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not save this job.");
    }
  }
  
async function searchLiveJobs(event?: React.FormEvent<HTMLFormElement>) {
  event?.preventDefault();

  if (liveQuery.trim().length < 2) {
    setLiveError("Enter at least 2 characters to search.");
    return;
  }

  setLiveLoading(true);
  setLiveError("");
  setLiveSearched(true);

  try {
    const params = new URLSearchParams({
      query: liveQuery.trim(),
      country: liveCountry,
    });

    const response = await fetch(
      `${API}/jobs/search?${params.toString()}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Job search failed.");
    }

    setLiveJobs(data.jobs || []);

    if (!data.jobs?.length) {
      setLiveError("No jobs found. Try different keywords.");
    }
  } catch (error) {
    setLiveJobs([]);
    setLiveError(
      error instanceof Error
        ? error.message
        : "Unable to fetch jobs. Check the backend."
    );
  } finally {
    setLiveLoading(false);
  }
  }

  
async function analyzeResumeMatch(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setMatchLoading(true);
  setMatchError("");
  setMatchResult(null);

  try {
    const response = await fetch(`${API}/resume/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        job_title: matchJobTitle,
        company: matchCompany,
        job_description: matchDescription,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || "Unable to analyze your resume."
      );
    }

    setMatchResult(data);
  } catch (error) {
    setMatchError(
      error instanceof Error
        ? error.message
        : "Something went wrong during analysis."
    );
  } finally {
    setMatchLoading(false);
  }
}


async function saveLiveJob(job: LiveJob) {
  if (!job.url) {
    setLiveError("This job has no application URL.");
    setLiveSuccess("");
    return;
  }

  const alreadySaved = applications.some(
    (app) =>
      app.job_url === job.url ||
      (
        app.company.trim().toLowerCase() === job.company.trim().toLowerCase() &&
        app.job_title.trim().toLowerCase() === job.title.trim().toLowerCase()
      )
  );

  if (alreadySaved) {
    setLiveError("");
    setLiveSuccess("This job is already in your tracker.");
    return;
  }

  setSavingLiveJob(job.id);
  setLiveError("");
  setLiveSuccess("");

  try {
    const response = await fetch(`${API}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: job.company,
        job_title: job.title,
        job_url: job.url,
        notes: `Source: ${job.source}\nLocation: ${job.location}\nMatch score: ${job.match_score}%`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not save this job.");
    }

    const refreshResponse = await fetch(`${API}/applications`);

    if (!refreshResponse.ok) {
      throw new Error("Job was saved, but the tracker could not refresh. Reload the page.");
    }

    const applicationsData = await refreshResponse.json();

    setApplications(
      Array.isArray(applicationsData)
        ? applicationsData
        : applicationsData.applications || []
    );

    setLiveSuccess(`Saved "${job.title}" to your application tracker.`);
  } catch (error) {
    setLiveError(
      error instanceof Error ? error.message : "Could not save this job."
    );
  } finally {
    setSavingLiveJob(null);
  }
}




  async function updateStatus(app: Application, status: string) {
    setBusyId(app.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API}/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: app.notes }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));

      const updated: Application = await response.json();
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      notify(`Status updated to "${status}".`);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteApplication(app: Application) {
    if (
      !window.confirm(
        `Remove "${app.job_title}" at ${app.company} from your tracker?`
      )
    ) {
      return;
    }

    setBusyId(app.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API}/applications/${app.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await errorMessage(response));

      setApplications((current) =>
        current.filter((item) => item.id !== app.id)
      );
      notify("Job removed from your tracker.");
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not remove this job.");
    } finally {
      setBusyId(null);
    }
  }

  
  async function uploadResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("resume") as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file) {
      fail("Choose a PDF or DOCX resume first.");
      return;
    }
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      fail("Only PDF and DOCX files are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      fail("Your resume must be 5 MB or smaller.");
      return;
    }

    const uploadData = new FormData();
    uploadData.append("file", file);
    setUploadingResume(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API}/resume`, {
        method: "POST",
        body: uploadData,
      });

      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }

      const result = await response.json();

      // Update the resume preview.
      setResume(result);

      // Update My Profile if the backend returned the updated profile.
      if (result.profile) {
        setProfile((current) => ({
          ...current,
          ...result.profile,
        }));
      } else {
        // Otherwise, reload the profile saved by the backend.
        const profileResponse = await fetch(`${API}/profile`);
        if (profileResponse.ok) {
          const savedProfile = await profileResponse.json();
          setProfile((current) => ({
            ...current,
            ...savedProfile,
          }));
        }
      }

      setResumeVisible(true);
      form.reset();
      notify("Resume uploaded. Profile refreshed.");
    } catch (err) {
      fail(err instanceof Error ? err.message : "Resume upload failed.");
    } finally {
      setUploadingResume(false);
    }
  }


  async function copyResumeText() {
    if (!resume?.extracted_text) {
      fail("There is no extracted resume text to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(resume.extracted_text);
      notify("Extracted resume text copied.");
    } catch {
      fail("Clipboard access failed. Select the text and copy it manually.");
    }
  }

  function changePage(name: string) {
    setActive(name);
    setNotice("");
    setError("");
  }

  
const pageDescription: Record<string, string> = {
  Overview: "Your real career progress, all in one place.",
  "Find jobs": "Save opportunities you discover and organize them here.",
  "My applications": "Search, update, and manage your application pipeline.",
  "My Profile": "Keep your professional information ready to use.",
  "Resume studio": "Upload your resume and inspect its extracted text.",
  "Resume Match": "Compare your resume with a job description and identify skill gaps.",
};


  return (
    <main className="min-h-screen bg-[#F7F8FC] text-slate-900 md:flex">
      <aside
        className={`flex w-full shrink-0 flex-col bg-[#111322] px-3 py-5 text-white md:sticky md:top-0 md:h-screen ${
          collapsed ? "md:w-[84px]" : "md:w-[248px]"
        }`}
      >
        <div className="mb-8 flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="flex min-w-0 items-center gap-3 rounded-xl p-2 text-left hover:bg-white/5"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-xl font-bold">
              J
            </span>
            {!collapsed && (
              <span>
                <span className="block text-lg font-semibold">JobZen</span>
                <span className="block text-xs text-slate-400">
                  Career workspace
                </span>
              </span>
            )}
          </button>
          <span className="hidden text-slate-500 md:block">
            {collapsed ? "" : ""}
          </span>
        </div>

        {!collapsed && (
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Workspace
          </p>
        )}

        <nav className="flex flex-wrap gap-1 md:flex-col">
          {NAV.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => changePage(item.name)}
              title={collapsed ? item.name : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                active === item.name
                  ? "bg-violet-500/15 font-medium text-violet-300 ring-1 ring-violet-400/20"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              } ${collapsed ? "md:justify-center" : ""}`}
            >
              <span className="w-5 text-center text-lg">{item.icon}</span>
              {!collapsed && <span>{item.name}</span>}
              {!collapsed && item.name === "My applications" && (
                <span className="ml-auto rounded-md bg-white/10 px-2 py-0.5 text-xs">
                  {applications.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {!collapsed && (
          <div className="mt-auto hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:block">
            <div className="mb-2 text-lg text-amber-300">✦</div>
            <p className="text-sm font-medium">One step at a time</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Keep your profile ready and track each opportunity.
            </p>
          </div>
        )}
      </aside>

      <section className="min-w-0 flex-1 px-4 py-6 sm:px-7 lg:px-10">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-violet-600">
              YOUR CAREER, IN FOCUS
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {active === "Overview" ? "Your career dashboard" : active}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {pageDescription[active]}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
            <button
              type="button"
              onClick={() => changePage("My Profile")}
              className="flex items-center gap-2 rounded-xl bg-[#E7E2FF] px-3 py-2 text-sm font-medium text-violet-800"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                {(profile.full_name || "ME").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}
              </span>
              <span className="max-w-36 truncate">
                {profile.full_name || "My profile"}
              </span>
            </button>
          </div>
        </header>

        {notice && (
          <div
            role="status"
            className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification">
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
            <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className={cardClass}>
            <p className="text-sm text-slate-500">Loading your saved JobZen data…</p>
          </div>
        ) : (
          <>
            {active === "Overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {[
                    { label: "Total tracked", value: applications.length, icon: "▤", color: "bg-blue-50 text-blue-700" },
                    { label: "Saved jobs", value: savedCount, icon: "♡", color: "bg-violet-50 text-violet-700" },
                    { label: "Interviews", value: interviewCount, icon: "✳", color: "bg-amber-50 text-amber-700" },
                    { label: "Offers", value: offerCount, icon: "✓", color: "bg-emerald-50 text-emerald-700" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
                      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-xl ${stat.color}`}>
                        {stat.icon}
                      </div>
                      <div className="text-2xl font-semibold">{stat.value}</div>
                      <div className="mt-1 text-sm text-slate-500">{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                  <div className="rounded-2xl bg-gradient-to-br from-[#252044] via-[#34285E] to-[#5A42A6] p-6 text-white shadow-lg sm:p-8">
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-violet-100">
                      YOUR CAREER WORKSPACE
                    </span>
                    <h2 className="mt-6 max-w-md text-2xl font-semibold leading-tight sm:text-3xl">
                      Make your next career move with a plan.
                    </h2>
                    <p className="mt-3 max-w-lg text-sm leading-6 text-violet-100/80">
                      Keep track of roles, update your profile, and prepare your resume. You stay in control of every application.
                    </p>
                  
<div className="mt-6 flex flex-wrap gap-3">
  <button
    type="button"
    onClick={() => changePage("Find jobs")}
    className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#34285E] hover:bg-violet-50"
  >
    + Add a job
  </button>

  <button
    type="button"
    onClick={() => changePage("Resume studio")}
    className="rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
  >
    Open resume studio
  </button>
  <button
  type="button"
  onClick={() => changePage("Resume Match")}
  className="rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
>
  Analyze resume match
</button>

 
</div>

                  </div>

                  <div className={cardClass}>
                    <h2 className="font-semibold">Workspace checklist</h2>
                    <p className="mt-1 text-xs text-slate-500">Your current setup</p>
                    <div className="mt-5 space-y-4">
                      {[
                        { label: "Professional profile", done: Boolean(profile.full_name && profile.preferred_roles) },
                        { label: "Resume uploaded", done: Boolean(resume) },
                        { label: "First job tracked", done: applications.length > 0 },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-3">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${item.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                            {item.done ? "✓" : "○"}
                          </span>
                          <span className="flex-1 text-sm text-slate-700">{item.label}</span>
                          <span className={`text-xs font-medium ${item.done ? "text-emerald-700" : "text-slate-400"}`}>
                            {item.done ? "Complete" : "Pending"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => changePage("My Profile")} className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium hover:bg-slate-50">
                        Edit profile →
                      </button>
                      <button type="button" onClick={() => changePage("My applications")} className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium hover:bg-slate-50">
                        Tracker →
                      </button>
                    </div>
                  </div>
                </div>

                <div className={cardClass}>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">Recent activity</h2>
                      <p className="mt-1 text-sm text-slate-500">Your latest saved opportunities.</p>
                    </div>
                    <button type="button" onClick={() => changePage("My applications")} className="text-sm font-medium text-violet-700 hover:text-violet-900">
                      View tracker →
                    </button>
                  </div>
                  {applications.length === 0 ? (
                    <EmptyState
                      title="Your tracker is ready"
                      description="Add a job link or role you found online. It will appear here after you save it."
                      action="Add your first job"
                      onClick={() => changePage("Find jobs")}
                    />
                  ) : (
                    <div className="space-y-3">
                      {applications.slice(0, 5).map((app) => (
                        <ApplicationCard
                          key={app.id}
                          app={app}
                          busy={busyId === app.id}
                          onStatus={updateStatus}
                          onDelete={deleteApplication}
                        />
                      ))}
                    </div>
                  )}
                  <p className="mt-4 text-xs text-slate-400">
                    Active tracked roles: {activeCount}
                  </p>
                </div>
              </div>
            )}

            {active === "Find jobs" && (
              <div className="space-y-5">
                
<div className={cardClass}>
  <h2 className="text-lg font-semibold">Discover Live Jobs</h2>
  <p className="mt-1 text-sm text-slate-500">
    Search job listings and compare them with your profile.
  </p>

  <form
    onSubmit={searchLiveJobs}
    className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]"
  >
    <input
      className={inputClass}
      value={liveQuery}
      onChange={(event) => setLiveQuery(event.target.value)}
      placeholder="AI Engineer, Java Developer..."
      aria-label="Job search keywords"
      required
    />

    <select
      className={inputClass}
      value={liveCountry}
      onChange={(event) => setLiveCountry(event.target.value)}
      aria-label="Job location"
    >
      <option value="India">India</option>
      <option value="United States">United States</option>
      <option value="United Kingdom">United Kingdom</option>
      <option value="Canada">Canada</option>
      <option value="Germany">Germany</option>
      <option value="">Worldwide</option>
    </select>

    <button
      type="submit"
      disabled={liveLoading}
      className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
    >
      {liveLoading ? "Searching..." : "Search Jobs"}
    </button>
  </form>

  {liveError && (
    <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      {liveError}
    </p>
  )}
  
{liveSuccess && (
  <p
    role="status"
    className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
  >
    ✓ {liveSuccess}
  </p>
)}


  {liveLoading && (
    <p className="mt-4 text-sm text-slate-500">
      Fetching jobs...
    </p>
  )}

  {!liveLoading && liveSearched && liveJobs.length > 0 && (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-slate-500">
        Found {liveJobs.length} listings from Himalayas.
      </p>

      {liveJobs.map((job) => (
        <article
          key={job.id}
          className="rounded-xl border border-slate-200 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-slate-900">
                {job.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {job.company} · {job.location}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {job.employment_type} · {job.source}
              </p>
            </div>

            <span className="rounded-lg bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700">
              {job.match_score}% match
            </span>
          </div>

          {job.description && (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {job.description.slice(0, 350)}
              {job.description.length > 350 ? "..." : ""}
            </p>
          )}

          {job.matched_skills.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Matched skills: {job.matched_skills.join(", ")}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                View Job ↗
              </a>
            )}

            <button
              type="button"
              onClick={() => saveLiveJob(job)}
              disabled={savingLiveJob === job.id}
              className="rounded-lg bg-[#17172B] px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60"
            >
              {savingLiveJob === job.id
                ? "Saving..."
                : "Save to Tracker"}
            </button>
          </div>
        </article>
      ))}
    </div>
  )}
</div>

                <div className={cardClass}>
                  <h2 className="text-lg font-semibold">Add an opportunity</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Paste a job posting you found on a company careers page or job board. JobZen will save it to your tracker; it does not fetch or verify vacancies automatically yet.
                  </p>

                  <form onSubmit={addJob} className="mt-5 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Company"
                        value={jobForm.company}
                        onChange={(value) => setJobForm((current) => ({ ...current, company: value }))}
                        placeholder="e.g. Example Technologies"
                        required
                      />
                      <Field
                        label="Job title"
                        value={jobForm.job_title}
                        onChange={(value) => setJobForm((current) => ({ ...current, job_title: value }))}
                        placeholder="e.g. Software Engineer"
                        required
                      />
                    </div>
                    <Field
                      label="Job posting URL (optional)"
                      value={jobForm.job_url}
                      onChange={(value) => setJobForm((current) => ({ ...current, job_url: value }))}
                      placeholder="https://company.com/careers/job..."
                    />
                    <label className={labelClass}>
                      Notes (optional)
                      <textarea
                        className={inputClass}
                        rows={3}
                        value={jobForm.notes}
                        onChange={(event) => setJobForm((current) => ({ ...current, notes: event.target.value }))}
                        placeholder="Location, salary, deadline, referral contact, or next steps…"
                      />
                    </label>
                    <button type="submit" className="rounded-xl bg-[#17172B] px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800">
                      + Save job to tracker
                    </button>
                  </form>
                </div>

                <div className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">Your saved opportunities</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Search and filter roles already stored in your database.
                      </p>
                    </div>
                    <span className="rounded-lg bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700">
                      {filteredJobs.length} results
                    </span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_210px]">
                    <input
                      className={inputClass}
                      value={jobSearch}
                      onChange={(event) => setJobSearch(event.target.value)}
                      placeholder="Search company, title, notes…"
                      aria-label="Search saved jobs"
                    />
                    <select className={inputClass} value={jobStatus} onChange={(event) => setJobStatus(event.target.value)} aria-label="Filter saved jobs by status">
                      <option value="All">All statuses</option>
                      {STATUSES.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </div>
                  <div className="mt-5 space-y-3">
                    {filteredJobs.length ? (
                      filteredJobs.map((app) => (
                        <ApplicationCard key={app.id} app={app} busy={busyId === app.id} onStatus={updateStatus} onDelete={deleteApplication} />
                      ))
                    ) : (
                      <EmptyState
                        title={applications.length ? "No matching jobs" : "No saved opportunities yet"}
                        description={applications.length ? "Try another keyword or status filter." : "Add a job above to start building your personal opportunity list."}
                        action={applications.length ? undefined : "Enter your first job above"}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {active === "My applications" && (
              <div className={cardClass}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Application tracker</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Update progress as you apply and hear back.
                    </p>
                  </div>
                  <button type="button" onClick={() => changePage("Find jobs")} className="rounded-xl bg-[#17172B] px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-800">
                    + Add job
                  </button>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_210px]">
                  <input
                    className={inputClass}
                    value={appSearch}
                    onChange={(event) => setAppSearch(event.target.value)}
                    placeholder="Search company, role, or notes…"
                    aria-label="Search applications"
                  />
                  <select className={inputClass} value={appStatus} onChange={(event) => setAppStatus(event.target.value)} aria-label="Filter applications by status">
                    <option value="All">All statuses</option>
                    {STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </div>
                <div className="mt-5 space-y-3">
                  {filteredApplications.length ? (
                    filteredApplications.map((app) => (
                      <ApplicationCard key={app.id} app={app} busy={busyId === app.id} onStatus={updateStatus} onDelete={deleteApplication} />
                    ))
                  ) : (
                    <EmptyState
                      title={applications.length ? "No matching applications" : "Nothing in your tracker yet"}
                      description={applications.length ? "Change the search or filter to see other entries." : "Save a role from Find jobs to start tracking it here."}
                      action="Go to Find jobs"
                      onClick={() => changePage("Find jobs")}
                    />
                  )}
                </div>
              </div>
            )}

            {active === "My Profile" && (
              <div className="max-w-4xl space-y-5">
                <div className={cardClass}>
                  <h2 className="text-lg font-semibold">Your professional profile</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    This information is saved to your local backend database.
                  </p>
                  <form onSubmit={saveProfile} className="mt-6 space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Full name" value={profile.full_name} onChange={(value) => updateProfile("full_name", value)} placeholder="Your name" />
                      <Field label="Email" value={profile.email} onChange={(value) => updateProfile("email", value)} placeholder="you@example.com" type="email" />
                      <Field label="Phone" value={profile.phone} onChange={(value) => updateProfile("phone", value)} placeholder="Phone number" />
                      <Field label="Location" value={profile.location} onChange={(value) => updateProfile("location", value)} placeholder="City, country" />
                    </div>
                    <Field label="Professional headline" value={profile.headline} onChange={(value) => updateProfile("headline", value)} placeholder="e.g. Software Engineer | AI & Backend" />
                    <label className={labelClass}>
                      Skills
                      <textarea className={inputClass} rows={3} value={profile.skills} onChange={(event) => updateProfile("skills", event.target.value)} placeholder="Python, Java, FastAPI, SQL, React…" />
                    </label>
                    <label className={labelClass}>
                      Experience and education
                      <textarea className={inputClass} rows={5} value={profile.experience} onChange={(event) => updateProfile("experience", event.target.value)} placeholder="Roles, projects, education, and achievements…" />
                    </label>
                    <Field label="Preferred job roles" value={profile.preferred_roles} onChange={(value) => updateProfile("preferred_roles", value)} placeholder="AI Engineer, Software Engineer, Backend Developer…" />
                    <button type="submit" disabled={savingProfile} className="rounded-xl bg-[#17172B] px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
                      {savingProfile ? "Saving…" : "Save profile"}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {active === "Resume studio" && (
              <div className="max-w-4xl space-y-5">
                <div className={cardClass}>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-2xl text-violet-700">
                    ▧
                  </div>
                  <h2 className="text-lg font-semibold">Resume studio</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Upload a PDF or DOCX file to extract readable text. This feature does not yet rewrite your resume or send it to an AI provider.
                  </p>
                  <form onSubmit={uploadResume} className="mt-5 rounded-xl border-2 border-dashed border-slate-200 p-5 sm:p-7">
                    <label className={labelClass}>
                      Resume file (PDF or DOCX, maximum 5 MB)
                      <input
                        key={resume?.id ?? "resume-input"}
                        type="file"
                        name="resume"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="mt-3 block w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-violet-50 file:px-4 file:py-2 file:font-medium file:text-violet-700"
                      />
                    </label>
                    <button type="submit" disabled={uploadingResume} className="mt-4 rounded-xl bg-[#17172B] px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
                      {uploadingResume ? "Uploading…" : "Upload and extract text"}
                    </button>
                  </form>
          
                </div>

                {resume ? (
                  <div className={cardClass}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-semibold">Your uploaded resume</h2>
                        <p className="mt-1 break-all text-sm text-slate-500">{resume.filename}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {(resume.character_count ?? resume.extracted_text.length).toLocaleString()} extracted characters
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setResumeVisible((value) => !value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                          {resumeVisible ? "Hide text" : "Show text"}
                        </button>
                        <button type="button" onClick={() => void copyResumeText()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                          Copy text
                        </button>
                      </div>
                    </div>
                                       {resumeVisible && (
                      <pre className="mt-5 max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                        {resume.extracted_text || "No readable text was extracted from this file."}
                      </pre>
                    )}
                  </div>
                ) : (
                  <div className={cardClass}>
                    <EmptyState
                      title="No resume uploaded"
                      description="Upload a PDF or DOCX above to inspect the extracted text here."
                    />
                  </div>
                )}
              </div>
            )}

            {active === "Resume Match" && (
              <div className="max-w-5xl space-y-6">
                <div className={cardClass}>
                  <h2 className="text-lg font-semibold">
                    AI Resume-to-Job Match Analyzer
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Compare your uploaded resume with a job description to identify matching skills and skill gaps.
                  </p>

                  <form
                    onSubmit={analyzeResumeMatch}
                    className="mt-6 space-y-5"
                  >
                    <div className="grid gap-5 sm:grid-cols-2">
                      <label className={labelClass}>
                        Job title *
                        <input
                          className={inputClass}
                          value={matchJobTitle}
                          onChange={(event) =>
                            setMatchJobTitle(event.target.value)
                          }
                          placeholder="e.g. AI Engineer"
                          required
                        />
                      </label>

                      <label className={labelClass}>
                        Company
                        <input
                          className={inputClass}
                          value={matchCompany}
                          onChange={(event) =>
                            setMatchCompany(event.target.value)
                          }
                          placeholder="e.g. Cisco"
                        />
                      </label>
                    </div>

                    <label className={labelClass}>
                      Job description *
                      <textarea
                        className={inputClass}
                        rows={9}
                        value={matchDescription}
                        onChange={(event) =>
                          setMatchDescription(event.target.value)
                        }
                        placeholder="Paste the job description here..."
                        required
                      />
                    </label>

                    {matchError && (
                      <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                        {matchError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={matchLoading}
                      className="rounded-xl bg-[#17172B] px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                    >
                      {matchLoading
                        ? "Analyzing resume..."
                        : "Analyze Match"}
                    </button>
                  </form>
                </div>

                {matchResult && (
                  <div className={cardClass}>
                    <h2 className="text-lg font-semibold">
                      Your Match Results
                    </h2>

                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl bg-violet-50 p-5">
                        <p className="text-sm text-slate-500">Match score</p>
                        <p className="mt-2 text-3xl font-bold text-violet-700">
                          {matchResult.match_score ??
                            matchResult.score ??
                            0}
                          %
                        </p>
                      </div>

                      <div className="rounded-xl bg-emerald-50 p-5">
                        <p className="text-sm text-slate-500">
                          Matched skills
                        </p>
                        <p className="mt-2 text-3xl font-bold text-emerald-700">
                          {(matchResult.matched_skills ?? []).length}
                        </p>
                      </div>

                      <div className="rounded-xl bg-amber-50 p-5">
                        <p className="text-sm text-slate-500">Skill gaps</p>
                        <p className="mt-2 text-3xl font-bold text-amber-700">
                          {(matchResult.missing_skills ?? []).length}
                        </p>
                      </div>
                    </div>

                    <p className="mt-5 text-sm leading-6 text-slate-600">
                      {matchResult.verdict ??
                        "Review your matched skills and skill gaps below."}
                    </p>

                    <div className="mt-6 grid gap-5 md:grid-cols-2">
                      <div>
                        <h3 className="font-semibold text-emerald-700">
                          Matched skills
                        </h3>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(matchResult.matched_skills ?? []).map(
                            (skill: string) => (
                              <span
                                key={skill}
                                className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800"
                              >
                                {skill}
                              </span>
                            )
                          )}
                          {!matchResult.matched_skills?.length && (
                            <p className="text-sm text-slate-500">
                              No matching skills identified.
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className="font-semibold text-amber-700">
                          Skills to improve
                        </h3>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(matchResult.missing_skills ?? []).map(
                            (skill: string) => (
                              <span
                                key={skill}
                                className="rounded-full bg-amber-50 px-3 py-1.5 text-sm text-amber-800"
                              >
                                {skill}
                              </span>
                            )
                          )}
                          {!matchResult.missing_skills?.length && (
                            <p className="text-sm text-slate-500">
                              No skill gaps identified.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {matchResult.strengths?.length > 0 && (
                      <div className="mt-6">
                        <h3 className="font-semibold">Your strengths</h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                          {matchResult.strengths.map(
                            (item: string, index: number) => (
                              <li key={index}>{item}</li>
                            )
                          )}
                        </ul>
                      </div>
                    )}

                    {matchResult.recommendations?.length > 0 && (
                      <div className="mt-6">
                        <h3 className="font-semibold">
                          Recommended next steps
                        </h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                          {matchResult.recommendations.map(
                            (item: string, index: number) => (
                              <li key={index}>{item}</li>
                            )
                          )}
                        </ul>
                      </div>
                    )}

                    <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400">
                      The score is an estimate based on detected skills, not a
                      guarantee of interview selection.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <footer className="mt-10 border-t border-slate-200 py-5 text-xs text-slate-400">
          JobZen · Local career workspace ·
        </footer>
      </section>
    </main>
  );
}

function EmptyState({
  title,
  description,
  action,
  onClick,
}: {
  title: string;
  description: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-7 text-center">
      <div className="text-3xl text-violet-500">✦</div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {action && onClick && (
        <button type="button" onClick={onClick} className="mt-4 rounded-xl bg-[#17172B] px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-800">
          {action}
        </button>
      )}
      {action && !onClick && (
        <p className="mt-3 text-xs text-slate-400">{action}</p>
      )}
    </div>
  );
}

function ApplicationCard({
  app,
  busy,
  onStatus,
  onDelete,
}: {
  app: Application;
  busy: boolean;
  onStatus: (app: Application, status: string) => void;
  onDelete: (app: Application) => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200/80 bg-white p-4 transition hover:border-violet-200 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-sm font-bold text-violet-800">
          {app.company?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{app.job_title}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {app.company} · Added {dateLabel(app.created_at)}
          </p>
          {app.job_url && (
            <a
              href={app.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block break-all text-sm text-violet-700 underline underline-offset-2"
            >
              Open job posting ↗
            </a>
          )}
          {app.notes && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">
              {app.notes}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(app)}
          className="rounded-lg border border-red-100 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Remove
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <label className="text-xs font-medium text-slate-500">
          Status
          <select
            value={app.status}
            disabled={busy}
            onChange={(event) => onStatus(app, event.target.value)}
            className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
          >
            {!STATUSES.includes(app.status) && (
              <option value={app.status}>{app.status}</option>
            )}
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        {busy && <span className="text-xs text-slate-400">Saving…</span>}
      </div>
    </article>
  );
}
