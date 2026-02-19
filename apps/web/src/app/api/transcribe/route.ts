import { NextResponse } from "next/server";
import { getCeleryClient } from "@/lib/transcription/celery-client";

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        
        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        
        // Save to shared volume for faster processing and lower memory usage
        const uploadDir = "/app/tmp/transcriptions";
        const fs = require("fs");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const timestamp = Date.now();
        const filename = `audio_${timestamp}.wav`;
        const filePath = `${uploadDir}/${filename}`;
        
        fs.writeFileSync(filePath, buffer);

        console.log(`Submitting transcription job to Worker API (File: ${filename})...`);
        
        try {
            const response = await fetch("http://worker:8000/transcribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename }),
            });

            if (!response.ok) {
                throw new Error(`Worker API returned ${response.status}`);
            }

            const data = await response.json();
            console.log("Job submitted. Job ID:", data.jobId);
            return NextResponse.json({ jobId: data.jobId });
        } catch (apiError) {
            console.error("Worker API Error:", apiError);
            throw new Error("Failed to communicate with transcription worker");
        }
    } catch (error) {
        console.error("Transcription API Error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: `Failed to submit job: ${message}` }, { status: 500 });
    }
}
