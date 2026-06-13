# Use official Python slim image for a lightweight build
FROM python:3.10-slim

# Install system dependencies (ffmpeg and libsndfile1 are required for audio analysis)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Set default worker API URL pointing to the production site
ENV WORKER_API_URL=https://panda-key.pages.dev


# Copy requirements file first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY main.py .

# Expose port (7860 is default for Hugging Face Spaces, but Render/Railway will override with PORT env var)
EXPOSE 7860

# Start Uvicorn, binding to the PORT environment variable if present, defaulting to 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
