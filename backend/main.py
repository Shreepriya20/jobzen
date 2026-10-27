
from contextlib import asynccontextmanager
from pathlib import Path
import re
import sqlite3
import uuid

from docx import Document
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pypdf import PdfReader


BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "jobzen.db"
UPLOAD_DIR = BASE_DIR / "uploads"
MAX_FILE_SIZE = 5 * 1024 * 1024

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company TEXT NOT NULL,
                job_title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Saved',
                job_url TEXT,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                full_name TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                location TEXT NOT NULL DEFAULT '',
                headline TEXT NOT NULL DEFAULT '',
                skills TEXT NOT NULL DEFAULT '',
                experience TEXT NOT NULL DEFAULT '',
                preferred_roles TEXT NOT NULL DEFAULT ''
            )
        """)

        connection.execute(
            "INSERT OR IGNORE INTO profile (id) VALUES (1)"
        )

        connection.execute("""
            CREATE TABLE IF NOT EXISTS resumes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL,
                extracted_text TEXT NOT NULL,
                uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="JobZen API",
    description="Local backend for the JobZen career workspace",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ApplicationCreate(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    job_title: str = Field(min_length=1, max_length=200)
    status: str = Field(default="Saved", max_length=50)
    job_url: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=5000)


class ApplicationUpdate(BaseModel):
    status: str = Field(min_length=1, max_length=50)
    notes: str | None = Field(default=None, max_length=5000)


class ProfileUpdate(BaseModel):
    full_name: str = Field(default="", max_length=200)
    email: str = Field(default="", max_length=320)
    phone: str = Field(default="", max_length=50)
    location: str = Field(default="", max_length=200)
    headline: str = Field(default="", max_length=300)
    skills: str = Field(default="", max_length=5000)
    experience: str = Field(default="", max_length=10000)
    preferred_roles: str = Field(default="", max_length=1000)


@app.get("/")
def home():
    return {
        "message": "Welcome to JobZen API!",
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


# ---------------------------------------------------------
# APPLICATION TRACKER
# ---------------------------------------------------------

@app.get("/applications")
def get_applications():
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM applications ORDER BY id DESC"
        ).fetchall()
        return [dict(row) for row in rows]


@app.post("/applications", status_code=201)
def create_application(application: ApplicationCreate):
    company = application.company.strip()
    job_title = application.job_title.strip()

    if not company or not job_title:
        raise HTTPException(
            status_code=422,
            detail="Company and job title are required.",
        )

    with get_connection() as connection:
        existing = connection.execute(
            """
            SELECT id FROM applications
            WHERE lower(company) = lower(?)
              AND lower(job_title) = lower(?)
            """,
            (company, job_title),
        ).fetchone()

        if existing:
            raise HTTPException(
                status_code=409,
                detail="This company and role are already in your tracker.",
            )

        cursor = connection.execute(
            """
            INSERT INTO applications
                (company, job_title, status, job_url, notes)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                company,
                job_title,
                application.status,
                application.job_url,
                application.notes,
            ),
        )

        row = connection.execute(
            "SELECT * FROM applications WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()

        return dict(row)


@app.patch("/applications/{application_id}")
def update_application(
    application_id: int,
    update: ApplicationUpdate,
):
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM applications WHERE id = ?",
            (application_id,),
        ).fetchone()

        if not existing:
            raise HTTPException(
                status_code=404,
                detail="Application not found.",
            )

        connection.execute(
            """
            UPDATE applications
            SET status = ?, notes = ?
            WHERE id = ?
            """,
            (update.status, update.notes, application_id),
        )

        row = connection.execute(
            "SELECT * FROM applications WHERE id = ?",
            (application_id,),
        ).fetchone()

        return dict(row)


@app.delete("/applications/{application_id}")
def delete_application(application_id: int):
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM applications WHERE id = ?",
            (application_id,),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Application not found.",
            )

    return {"message": "Application deleted."}


# ---------------------------------------------------------
# PROFILE
# ---------------------------------------------------------

def read_profile(connection):
    row = connection.execute(
        "SELECT * FROM profile WHERE id = 1"
    ).fetchone()

    return dict(row) if row else {}


@app.get("/profile")
def get_profile():
    with get_connection() as connection:
        return read_profile(connection)


@app.put("/profile")
def save_profile(profile: ProfileUpdate):
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE profile SET
                full_name = ?,
                email = ?,
                phone = ?,
                location = ?,
                headline = ?,
                skills = ?,
                experience = ?,
                preferred_roles = ?
            WHERE id = 1
            """,
            (
                profile.full_name.strip(),
                profile.email.strip(),
                profile.phone.strip(),
                profile.location.strip(),
                profile.headline.strip(),
                profile.skills.strip(),
                profile.experience.strip(),
                profile.preferred_roles.strip(),
            ),
        )

        return read_profile(connection)


# ---------------------------------------------------------
# RESUME TEXT EXTRACTION
# ---------------------------------------------------------

def extract_resume_text(file_path: Path, extension: str) -> str:
    try:
        if extension == ".pdf":
            reader = PdfReader(str(file_path))

            if reader.is_encrypted:
                try:
                    unlocked = reader.decrypt("")
                except Exception:
                    unlocked = 0

                if not unlocked:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "This PDF is password-protected. "
                            "Upload an unlocked PDF."
                        ),
                    )

            text = "\n".join(
                page.extract_text() or ""
                for page in reader.pages
            )

        elif extension == ".docx":
            document = Document(str(file_path))

            paragraphs = [
                paragraph.text
                for paragraph in document.paragraphs
            ]

            table_text = [
                " | ".join(cell.text for cell in row.cells)
                for table in document.tables
                for row in table.rows
            ]

            text = "\n".join(paragraphs + table_text)

        else:
            raise HTTPException(
                status_code=400,
                detail="Only PDF and DOCX resumes are supported.",
            )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not read this resume. "
                "Please check the file and try again."
            ),
        ) from exc

    text = text.strip()

    if not text:
        raise HTTPException(
            status_code=422,
            detail=(
                "No text could be extracted. "
                "This may be a scanned PDF; OCR is not enabled yet."
            ),
        )

    return text


# ---------------------------------------------------------
# AUTOMATIC RESUME-TO-PROFILE ANALYSIS
# ---------------------------------------------------------

SKILL_NAMES = [
    "Python", "Java", "JavaScript", "TypeScript", "C", "C++", "C#",
    "SQL", "HTML", "CSS", "React", "Next.js", "Node.js", "Express.js",
    "FastAPI", "Flask", "Django", "Spring Boot", "REST APIs",
    "Machine Learning", "Deep Learning", "Natural Language Processing",
    "NLP", "Generative AI", "GenAI", "LLMs", "Large Language Models",
    "LangChain", "RAG", "Prompt Engineering", "TensorFlow", "PyTorch",
    "Scikit-learn", "Pandas", "NumPy", "Data Analysis", "Data Science",
    "MySQL", "PostgreSQL", "MongoDB", "SQLite", "Redis",
    "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes",
    "Jenkins", "CI/CD", "Git", "GitHub", "Linux",
    "Object-Oriented Programming", "OOP", "Data Structures",
    "Algorithms", "DSA", "Unit Testing", "PyTest",
    "Agile", "Microservices", "Apache Kafka",
]


ROLE_KEYWORDS = [
    "AI Engineer",
    "Machine Learning Engineer",
    "Software Engineer",
    "Software Developer",
    "Python Developer",
    "Java Developer",
    "Backend Developer",
    "Backend Engineer",
    "Full Stack Developer",
    "Full-Stack Developer",
    "Frontend Developer",
    "Front-End Developer",
    "Data Scientist",
    "Data Analyst",
    "NLP Engineer",
    "Generative AI Engineer",
    "DevOps Engineer",
    "Cloud Engineer",
    "Web Developer",
]


SECTION_HEADINGS = {
    "experience",
    "work experience",
    "professional experience",
    "employment history",
    "education",
    "academic background",
    "skills",
    "technical skills",
    "projects",
    "personal projects",
    "certifications",
    "certificates",
    "achievements",
    "summary",
    "professional summary",
    "profile",
    "objective",
    "career objective",
    "contact",
    "contact details",
    "languages",
    "interests",
    "references",
}


def clean_text(value: str) -> str:
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def find_email(text: str) -> str:
    match = re.search(
        r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
        text,
        re.IGNORECASE,
    )
    return match.group(0) if match else ""


def find_phone(text: str) -> str:
    # Prefer phone numbers with at least 10 digits.
    candidates = re.findall(
        r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)",
        text,
    )

    for candidate in candidates:
        digits = re.sub(r"\D", "", candidate)

        if 10 <= len(digits) <= 15:
            return candidate.strip()

    return ""


def find_name(text: str, email: str) -> str:
    lines = [
        clean_text(line)
        for line in text.splitlines()
        if clean_text(line)
    ]

    ignored = SECTION_HEADINGS | {
        "resume",
        "curriculum vitae",
        "cv",
        "portfolio",
    }

    for line in lines[:12]:
        lowered = line.lower().strip(" :")

        if lowered in ignored:
            continue

        if email and email.lower() in line.lower():
            continue

        if "@" in line or "://" in line:
            continue

        if re.search(r"\d", line):
            continue

        if len(line) > 60:
            continue

        # Avoid treating contact details and long taglines as names.
        words = line.split()

        if not 2 <= len(words) <= 5:
            continue

        if not all(
            re.fullmatch(r"[A-Za-z][A-Za-z'.-]*", word)
            for word in words
        ):
            continue

        if any(
            word.lower() in {
                "engineer", "developer", "student",
                "professional", "manager", "resume",
            }
            for word in words
        ):
            continue

        return line

    return ""


def find_location(text: str) -> str:
    # Only use an explicitly labelled location to reduce false guesses.
    patterns = [
        r"(?im)^\s*(?:current\s+)?location\s*[:\-]\s*([^\n|,;]{2,80}(?:,\s*[^\n|;]{2,50})?)",
        r"(?im)^\s*address\s*[:\-]\s*([^\n]{3,100})",
    ]

    for pattern in patterns:
        match = re.search(pattern, text)

        if match:
            value = clean_text(match.group(1))
            if value:
                return value[:200]

    return ""


def find_skills(text: str) -> str:
    found = []
    seen = set()

    for skill in SKILL_NAMES:
        # Match the skill as a term rather than as part of a larger word.
        pattern = (
            r"(?<![A-Za-z0-9+#.])"
            + re.escape(skill)
            + r"(?![A-Za-z0-9+#.])"
        )

        if re.search(pattern, text, re.IGNORECASE):
            key = skill.lower()

            if key not in seen:
                seen.add(key)
                found.append(skill)

    return ", ".join(found)


def find_headline(text: str, name: str, email: str) -> str:
    lines = [
        clean_text(line)
        for line in text.splitlines()
        if clean_text(line)
    ]

    for line in lines[:15]:
        if name and line.casefold() == name.casefold():
            continue

        if email and email.casefold() in line.casefold():
            continue

        if "@" in line or "://" in line:
            continue

        if len(line) > 120:
            continue

        lowered = line.lower().strip(" :")

        if lowered in SECTION_HEADINGS:
            continue

        if re.search(
            r"\b(engineer|developer|scientist|analyst|intern|"
            r"programmer|architect|consultant)\b",
            line,
            re.IGNORECASE,
        ):
            return line[:300]

    return ""


def find_experience_section(text: str) -> str:
    lines = [
        clean_text(line)
        for line in text.splitlines()
    ]

    start = None

    for index, line in enumerate(lines):
        heading = line.lower().strip(" :|-")

        if heading in {
            "experience",
            "work experience",
            "professional experience",
            "employment history",
        }:
            start = index + 1
            break

    if start is None:
        return ""

    collected = []

    for line in lines[start:]:
        heading = line.lower().strip(" :|-")

        if heading in {
            "education",
            "academic background",
            "technical skills",
            "skills",
            "projects",
            "personal projects",
            "certifications",
            "certificates",
            "achievements",
            "languages",
            "interests",
            "references",
        }:
            break

        if line:
            collected.append(line)

    return "\n".join(collected)[:10000].strip()


def find_preferred_roles(text: str) -> str:
    found = []
    seen = set()

    for role in ROLE_KEYWORDS:
        if re.search(
            r"(?<![A-Za-z])"
            + re.escape(role)
            + r"(?![A-Za-z])",
            text,
            re.IGNORECASE,
        ):
            key = role.lower()

            if key not in seen:
                seen.add(key)
                found.append(role)

    return ", ".join(found[:10])


def extract_profile_fields(text: str) -> dict:
    email = find_email(text)
    name = find_name(text, email)
    skills = find_skills(text)
    experience = find_experience_section(text)
    headline = find_headline(text, name, email)
    preferred_roles = find_preferred_roles(text)
    location = find_location(text)
    phone = find_phone(text)

    return {
        "full_name": name,
        "email": email,
        "phone": phone,
        "location": location,
        "headline": headline,
        "skills": skills,
        "experience": experience,
        "preferred_roles": preferred_roles,
    }


def update_profile_from_resume(
    connection,
    extracted_fields: dict,
) -> dict:
    existing = read_profile(connection)

    # Do not erase existing information when extraction is uncertain.
    # Update only fields for which the resume provided a non-empty value.
    merged = {}

    for field, extracted_value in extracted_fields.items():
        old_value = existing.get(field, "")
        merged[field] = extracted_value or old_value or ""

    connection.execute(
        """
        UPDATE profile SET
            full_name = ?,
            email = ?,
            phone = ?,
            location = ?,
            headline = ?,
            skills = ?,
            experience = ?,
            preferred_roles = ?
        WHERE id = 1
        """,
        (
            merged["full_name"],
            merged["email"],
            merged["phone"],
            merged["location"],
            merged["headline"],
            merged["skills"],
            merged["experience"],
            merged["preferred_roles"],
        ),
    )

    return read_profile(connection)


# ---------------------------------------------------------
# UPLOAD RESUME AND AUTOMATICALLY UPDATE PROFILE
# ---------------------------------------------------------

@app.post("/resume", status_code=201)
async def upload_resume(file: UploadFile = File(...)):
    original_name = Path(file.filename or "resume").name
    extension = Path(original_name).suffix.lower()

    if extension not in {".pdf", ".docx"}:
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF or DOCX file.",
        )

    contents = await file.read(MAX_FILE_SIZE + 1)

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Resume must be 5 MB or smaller.",
        )

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    stored_name = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / stored_name

    try:
        destination.write_bytes(contents)
        extracted_text = extract_resume_text(destination, extension)
        extracted_fields = extract_profile_fields(extracted_text)

        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO resumes
                    (filename, stored_filename, extracted_text)
                VALUES (?, ?, ?)
                """,
                (original_name, stored_name, extracted_text),
            )

            resume_id = cursor.lastrowid

            # NEW: update the profile as part of the same upload workflow.
            updated_profile = update_profile_from_resume(
                connection,
                extracted_fields,
            )

            resume_row = connection.execute(
                """
                SELECT uploaded_at
                FROM resumes
                WHERE id = ?
                """,
                (resume_id,),
            ).fetchone()

            uploaded_at = (
                resume_row["uploaded_at"] if resume_row else None
            )

    except Exception:
        destination.unlink(missing_ok=True)
        raise

    return {
        "id": resume_id,
        "filename": original_name,
        "uploaded_at": uploaded_at,
        "extracted_text": extracted_text,
        "character_count": len(extracted_text),
        "extracted_fields": extracted_fields,
        "profile": updated_profile,
        "message": (
            "Resume uploaded. Your profile has been updated "
            "with the details detected in the resume."
        ),
    }


@app.get("/resume/latest")
def get_latest_resume():
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, filename, extracted_text, uploaded_at
            FROM resumes
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()

    if not row:
        return None

    return dict(row)

# ---------------------------------------------------------
# JOBZEN: EXPLAINABLE JOB MATCHING
# ---------------------------------------------------------

import re
from difflib import SequenceMatcher

from pydantic import BaseModel, Field


class JobMatchRequest(BaseModel):
    job_title: str = Field(default="", max_length=300)
    job_description: str = Field(min_length=10, max_length=20000)
    required_skills: list[str] = Field(default_factory=list, max_length=100)


def _match_normalize(value: str) -> str:
    value = value.lower().replace("node.js", "nodejs")
    value = value.replace("c++", "cplusplus").replace("c#", "csharp")
    return re.sub(r"[^a-z0-9+#.]+", " ", value).strip()


def _match_skill_list(value: str) -> list[str]:
    # Supports comma/newline-separated skills in the profile.
    return list(dict.fromkeys(
        item.strip()
        for item in re.split(r"[,;\n|]+", value or "")
        if item.strip()
    ))


@app.post("/match")
def match_job(request: JobMatchRequest):
    with get_connection() as connection:
        profile = read_profile(connection)

    if not profile:
        raise HTTPException(
            status_code=400,
            detail="Complete your profile before calculating a match."
        )

    profile_skills = _match_skill_list(profile.get("skills", ""))
    profile_text = " ".join([
        profile.get("headline", ""),
        profile.get("skills", ""),
        profile.get("experience", ""),
        profile.get("preferred_roles", ""),
    ])
    normalized_profile = _match_normalize(profile_text)

    description = request.job_description
    normalized_description = _match_normalize(
        request.job_title + " " + description
    )

    # Detect common technology and professional skills.
    common_skills = [
        "Python", "Java", "JavaScript", "TypeScript", "SQL",
        "React", "Next.js", "Node.js", "FastAPI", "Spring Boot",
        "Django", "Flask", "REST API", "HTML", "CSS",
        "Git", "Docker", "Kubernetes", "AWS", "Azure",
        "Machine Learning", "Deep Learning", "NLP",
        "Generative AI", "LLM", "LangChain", "Pandas",
        "NumPy", "TensorFlow", "PyTorch", "MongoDB", "MySQL",
        "PostgreSQL", "Linux", "CI/CD", "Jenkins",
        "Data Structures", "Algorithms", "OOP",
        "Communication", "Problem Solving", "Agile",
    ]

    candidates = list(dict.fromkeys(common_skills + request.required_skills))
    detected_skills = []

    for skill in candidates:
        normalized_skill = _match_normalize(skill)
        if normalized_skill and re.search(
            r"(?<![a-z0-9])" + re.escape(normalized_skill) + r"(?![a-z0-9])",
            normalized_description
        ):
            detected_skills.append(skill)

    # Compare each detected job skill with the candidate's saved skills.
    normalized_profile_skills = [
        _match_normalize(skill) for skill in profile_skills
    ]
    matched_skills = []
    missing_skills = []

    for skill in detected_skills:
        normalized_skill = _match_normalize(skill)
        if any(
            normalized_skill == candidate
            or SequenceMatcher(None, normalized_skill, candidate).ratio() >= 0.92
            for candidate in normalized_profile_skills
        ):
            matched_skills.append(skill)
        else:
            missing_skills.append(skill)

    if detected_skills:
        skill_score = round(
            100 * len(matched_skills) / len(detected_skills)
        )
    else:
        skill_score = 0

    preferred_roles = [
        role.strip()
        for role in re.split(r"[,;\n|]+", profile.get("preferred_roles", ""))
        if role.strip()
    ]
    title_text = _match_normalize(request.job_title)
    role_matches = [
        role for role in preferred_roles
        if _match_normalize(role) in title_text
        or title_text in _match_normalize(role)
    ]

    if not preferred_roles:
        role_score = 50
        role_note = "Add preferred roles to your profile for a more useful role-alignment score."
    elif role_matches:
        role_score = 100
        role_note = "The job title aligns with your preferred roles."
    else:
        role_score = 25
        role_note = "The job title does not clearly match your saved preferred roles."

    # Experience text is not reliably structured, so avoid claiming
    # that years-of-experience requirements have been verified.
    experience_text = profile.get("experience", "").strip()
    experience_score = 70 if experience_text else 35

    # Weighted score: skills 60%, role alignment 25%, profile completeness 15%.
    profile_completeness_score = (
        100 if experience_text and profile_skills else
        60 if experience_text or profile_skills else 25
    )
    score = round(
        skill_score * 0.60
        + role_score * 0.25
        + profile_completeness_score * 0.15
    )

    suggestions = []
    if missing_skills:
        suggestions.append(
            "Review these requirements and add skills to your profile only if you genuinely have them: "
            + ", ".join(missing_skills[:8]) + "."
        )
    if not profile_skills:
        suggestions.append("Add your technical and professional skills to My Profile.")
    if not preferred_roles:
        suggestions.append("Add preferred job titles to My Profile.")
    if not experience_text:
        suggestions.append("Add your experience and education to My Profile.")
    if not detected_skills:
        suggestions.append(
            "The posting did not contain recognizable skills. Add clearer requirements or list required skills separately."
        )

    return {
        "match_score": score,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "detected_job_skills": detected_skills,
        "skill_score": skill_score,
        "role_score": role_score,
        "profile_completeness_score": profile_completeness_score,
        "role_matches": role_matches,
        "explanation": [
            f"Skills match: {skill_score}% ({len(matched_skills)} of {len(detected_skills)} detected skills matched).",
            role_note,
            f"Profile completeness contribution: {profile_completeness_score}%.",
        ],
        "suggestions": suggestions,
        "disclaimer": (
            "This is a transparent profile-to-posting comparison, not a prediction "
            "of hiring success. Experience requirements are not independently verified."
        ),
    }

# ---------------------------------------------------------
# JOBZEN: PUBLIC JOB SEARCH (HIMALAYAS)
# ---------------------------------------------------------

import asyncio
import json
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException, Query


def _jobzen_text(value):
    """Convert text or HTML-like content into comparable plain text."""
    value = re.sub(r"<[^>]+>", " ", str(value or ""))
    return re.sub(r"\s+", " ", value).strip()


async def _jobzen_fetch_himalayas(params):
    """Call the public job API from the backend, not the browser."""
    url = "https://himalayas.app/jobs/api/search?" + urlencode(params)

    def fetch():
        request = Request(
            url,
            headers={"User-Agent": "JobZen/1.0", "Accept": "application/json"},
        )
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))

    try:
        return await asyncio.to_thread(fetch)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "The Himalayas job feed could not be reached. "
                "Please try again shortly."
            ),
        ) from exc


@app.get("/jobs/search")
async def jobzen_search_jobs(
    query: str = Query(default="software engineer", min_length=2, max_length=120),
    country: str = Query(default="", max_length=80),
    page: int = Query(default=1, ge=1, le=20),
):
    params = {
        "q": query.strip(),
        "page": page,
        "sort": "relevant",
    }
    if country.strip():
        params["country"] = country.strip()

    data = await _jobzen_fetch_himalayas(params)

    with get_connection() as connection:
        profile = read_profile(connection) or {}

    profile_skills = [
        skill.strip().lower()
        for skill in re.split(r"[,;\n|]+", profile.get("skills", "") or "")
        if skill.strip()
    ]
    preferred_roles = [
        role.strip().lower()
        for role in re.split(
            r"[,;\n|]+", profile.get("preferred_roles", "") or ""
        )
        if role.strip()
    ]

    results = []
    for job in data.get("jobs", []):
        title = _jobzen_text(job.get("title"))
        company = _jobzen_text(job.get("companyName"))
        excerpt = _jobzen_text(job.get("excerpt"))
        description = _jobzen_text(job.get("description"))
        searchable = f"{title} {excerpt} {description}".lower()

        matched_skills = [
            skill for skill in profile_skills
            if skill and skill in searchable
        ]
        # Explainable score: profile skill overlap plus preferred-role overlap.
        skill_score = round(
            100 * len(matched_skills) / len(profile_skills)
        ) if profile_skills else 0

        role_match = any(
            role in title.lower() or title.lower() in role
            for role in preferred_roles
        )
        match_score = min(
            100,
            round(skill_score * 0.8 + (20 if role_match else 0)),
        ) if profile_skills or preferred_roles else 0

        location_items = job.get("locationRestrictions") or []
        locations = [
            item.get("name", "") if isinstance(item, dict) else str(item)
            for item in location_items
        ]
        location_text = ", ".join(locations) if locations else "Remote / worldwide"

        results.append({
            "id": job.get("guid") or job.get("applicationLink") or title + company,
            "title": title,
            "company": company or "Company not listed",
            "location": location_text,
            "employment_type": job.get("employmentType") or "Not specified",
            "seniority": job.get("seniority") or [],
            "description": excerpt or description[:500],
            "url": job.get("applicationLink") or "",
            "source": "Himalayas",
            "source_url": "https://himalayas.app",
            "published_at": job.get("pubDate"),
            "match_score": match_score,
            "matched_skills": matched_skills,
        })

    return {
        "query": query.strip(),
        "country": country.strip(),
        "page": page,
        "total_count": data.get("totalCount", len(results)),
        "source": "Himalayas",
        "source_url": "https://himalayas.app",
        "jobs": results,
    }

# ==============================
# JobZen Resume-to-Job Match Analyzer
# ==============================

from pydantic import BaseModel, Field
import re


class ResumeMatchRequest(BaseModel):
    job_title: str = Field(default="", max_length=200)
    company: str = Field(default="", max_length=200)
    job_description: str = Field(min_length=20, max_length=30000)


MATCH_SKILLS = [
    "python", "java", "javascript", "typescript", "sql",
    "html", "css", "react", "next.js", "node.js",
    "fastapi", "django", "flask", "spring boot",
    "machine learning", "deep learning", "artificial intelligence",
    "generative ai", "llm", "nlp", "langchain",
    "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch",
    "rest api", "microservices", "docker", "kubernetes",
    "aws", "azure", "gcp", "git", "jenkins",
    "mysql", "postgresql", "mongodb", "sqlite",
    "data structures", "algorithms", "object-oriented programming",
    "fastapi", "linux", "testing", "pytest",
    "communication", "problem solving", "agile"
]


def _match_normalize(text: str) -> str:
    text = text.lower()
    text = text.replace("nodejs", "node.js")
    text = text.replace("nextjs", "next.js")
    text = text.replace("scikit learn", "scikit-learn")
    return re.sub(r"\s+", " ", text)


def _match_extract_skills(text: str) -> list[str]:
    normalized = _match_normalize(text)
    found = []

    for skill in MATCH_SKILLS:
        pattern = r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])"
        if re.search(pattern, normalized):
            found.append(skill)

    return sorted(set(found))


@app.post("/resume/match")
def analyze_resume_match(request: ResumeMatchRequest):
    # Read the latest resume using the existing JobZen resume endpoint.
    # This uses the application's existing resume storage and parser.
    import sqlite3
    import os

    db_path = os.path.join(os.path.dirname(__file__), "jobzen.db")

    if not os.path.exists(db_path):
        raise HTTPException(
            status_code=404,
            detail="No JobZen database was found. Upload your resume first."
        )

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    try:
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()

        resume_text = ""

        # Locate the existing resume table without changing its schema.
        for table in tables:
            table_name = table["name"]
            columns = conn.execute(
                f'PRAGMA table_info("{table_name}")'
            ).fetchall()

            column_names = [column["name"] for column in columns]

            if "extracted_text" in column_names:
                row = conn.execute(
                    f'SELECT * FROM "{table_name}" ORDER BY rowid DESC LIMIT 1'
                ).fetchone()

                if row and row["extracted_text"]:
                    resume_text = str(row["extracted_text"])
                    break

            for candidate in ("resume_text", "text", "content"):
                if candidate in column_names:
                    row = conn.execute(
                        f'SELECT * FROM "{table_name}" ORDER BY rowid DESC LIMIT 1'
                    ).fetchone()

                    if row and row[candidate]:
                        resume_text = str(row[candidate])
                        break

            if resume_text:
                break

    finally:
        conn.close()

    if not resume_text.strip():
        raise HTTPException(
            status_code=400,
            detail="No extracted resume text found. Upload your PDF or DOCX resume first."
        )

    resume_skills = _match_extract_skills(resume_text)
    job_skills = _match_extract_skills(request.job_description)

    matched_skills = sorted(set(resume_skills) & set(job_skills))
    missing_skills = sorted(set(job_skills) - set(resume_skills))

    if job_skills:
        score = round(len(matched_skills) / len(job_skills) * 100)
    else:
        score = 0

    if score >= 75:
        verdict = "Strong match"
    elif score >= 50:
        verdict = "Moderate match"
    elif score >= 25:
        verdict = "Partial match"
    else:
        verdict = "Low match"

    recommendations = []

    if missing_skills:
        recommendations.append(
            "Build evidence of these job-required skills: "
            + ", ".join(missing_skills[:8])
            + "."
        )

    if matched_skills:
        recommendations.append(
            "Highlight your relevant experience with "
            + ", ".join(matched_skills[:8])
            + " in your resume."
        )

    if not job_skills:
        recommendations.append(
            "This description contains few recognizable skills. "
            "Review the job requirements manually for a more complete assessment."
        )

    return {
        "job_title": request.job_title,
        "company": request.company,
        "match_score": score,
        "verdict": verdict,
        "resume_skills": resume_skills,
        "required_skills_found": job_skills,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "strengths": [
            f"Your resume mentions {skill}."
            for skill in matched_skills[:8]
        ],
        "recommendations": recommendations,
        "analysis_type": "Local skill-based analysis",
        "disclaimer": (
            "This score measures recognized skill overlap, not your overall "
            "suitability. Experience, proficiency, context, and qualifications "
            "are not fully evaluated."
        )
    }
