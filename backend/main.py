
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

        connection.execute("""
            INSERT OR IGNORE INTO profile (id) VALUES (1)
        """)

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
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
            SELECT * FROM applications
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
            raise HTTPException(status_code=404, detail="Application not found.")

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
            raise HTTPException(status_code=404, detail="Application not found.")

    return {"message": "Application deleted."}


@app.get("/profile")
def get_profile():
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM profile WHERE id = 1"
        ).fetchone()
        return dict(row)


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

        row = connection.execute(
            "SELECT * FROM profile WHERE id = 1"
        ).fetchone()
        return dict(row)


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
                        detail="This PDF is password-protected. Upload an unlocked PDF.",
                    )

            text = "\n".join(page.extract_text() or "" for page in reader.pages)

        elif extension == ".docx":
            document = Document(str(file_path))
            paragraphs = [p.text for p in document.paragraphs]
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
            detail="Could not read this resume. Please check the file and try again.",
        ) from exc

    text = text.strip()

    if not text:
        raise HTTPException(
            status_code=422,
            detail="No text could be extracted. This may be a scanned PDF; OCR is not enabled yet.",
        )

    return text


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
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    stored_name = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / stored_name

    try:
        destination.write_bytes(contents)
        extracted_text = extract_resume_text(destination, extension)

        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO resumes (filename, stored_filename, extracted_text)
                VALUES (?, ?, ?)
                """,
                (original_name, stored_name, extracted_text),
            )

            resume_id = cursor.lastrowid

    except Exception:
        destination.unlink(missing_ok=True)
        raise

    return {
        "id": resume_id,
        "filename": original_name,
        "uploaded_at": None,
        "extracted_text": extracted_text,
        "character_count": len(extracted_text),
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
