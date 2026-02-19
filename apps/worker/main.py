import os
import time
import shutil
import uuid
from typing import Dict
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from faster_whisper import WhisperModel

app = FastAPI()

# In-memory storage for job status (simpler than Redis for this use case)
jobs: Dict[str, Dict] = {}

# Faster-Whisper configuration
model_size = "small"
device = "cuda" if os.getenv("NVIDIA_VISIBLE_DEVICES") else "cpu"

print(f"Loading Faster-Whisper model ({model_size}) on {device}...")
model = WhisperModel(model_size, device=device, compute_type="float16" if device == "cuda" else "int8")
print(f"Faster-Whisper model loaded.")

class TranscriptionRequest(BaseModel):
    filename: str

def process_transcription(job_id: str, filename: str):
    file_path = f"/app/tmp/transcriptions/{filename}"
    
    if not os.path.exists(file_path):
        jobs[job_id]["status"] = "FAILURE"
        jobs[job_id]["error"] = "File not found"
        return

    try:
        jobs[job_id]["status"] = "PROGRESS"
        jobs[job_id]["progress"] = 0
        
        print(f"[{job_id}] Starting transcription for {filename}...")
        start_time = time.time()
        
        segments, info = model.transcribe(file_path, beam_size=5)
        total_duration = info.duration
        
        result_segments = []
        
        for segment in segments:
            result_segments.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text
            })
            
            progress = min(99, int((segment.end / total_duration) * 100))
            jobs[job_id]["progress"] = progress
            
        duration = time.time() - start_time
        print(f"[{job_id}] Finished in {duration:.2f}s")
        
        full_text = " ".join([s["text"] for s in result_segments])
        
        jobs[job_id]["status"] = "SUCCESS"
        jobs[job_id]["result"] = {
            "text": full_text,
            "segments": result_segments,
            "language": info.language
        }
        jobs[job_id]["progress"] = 100
        
        # Cleanup
        try:
            os.remove(file_path)
        except:
            pass

    except Exception as e:
        print(f"[{job_id}] Error: {e}")
        jobs[job_id]["status"] = "FAILURE"
        jobs[job_id]["error"] = str(e)

@app.post("/transcribe")
async def transcribe(request: TranscriptionRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "PENDING", "progress": 0}
    
    background_tasks.add_task(process_transcription, job_id, request.filename)
    
    return {"jobId": job_id}

@app.get("/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return jobs[job_id]
