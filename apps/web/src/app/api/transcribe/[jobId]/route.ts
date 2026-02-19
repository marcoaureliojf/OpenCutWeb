import { NextResponse } from "next/server";
import { getCeleryClient } from "@/lib/transcription/celery-client";

export async function GET(
    req: Request,
    { params }: { params: { jobId: string } }
) {
    try {
        const { jobId } = await params;
        
        try {
            const response = await fetch(`http://worker:8000/status/${jobId}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    return NextResponse.json({ error: "Job not found" }, { status: 404 });
                }
                throw new Error(`Worker API returned ${response.status}`);
            }

            const data = await response.json();
            return NextResponse.json(data);
            
        } catch (apiError) {
            console.error("Worker Status API Error:", apiError);
            // Return PENDING if worker is unreachable to avoid breaking the UI immediately
            return NextResponse.json({ status: "PENDING", error: "Worker unreachable" });
        }
    } catch (error) {
        console.error("Transcription Status API Error:", error);
        return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
    }
}
