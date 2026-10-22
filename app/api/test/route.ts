
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch("http://127.0.0.1:8000/health", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Backend returned an error");
    }

    const data = await response.json();
    return NextResponse.json({
      frontend: "connected",
      backend: data,
    });
  } catch {
    return NextResponse.json(
      {
        frontend: "running",
        backend: "unavailable",
      },
      { status: 503 }
    );
  }
}
