# Use a CUDA base image with cuDNN support for Faster-Whisper
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

WORKDIR /app

# Install Python and system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip setuptools wheel
RUN pip3 install --no-cache-dir -r requirements.txt

# Create transcription directory and set permissions
RUN mkdir -p /app/tmp/transcriptions && chmod 777 /app/tmp/transcriptions

COPY . .

# Run celery worker
CMD ["celery", "-A", "main", "worker", "--loglevel=info", "--concurrency=1"]
