FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Expose port
EXPOSE 8000

# Environment variables
ENV PYTHONUNBUFFERED=1

# Default command - user must provide path
CMD ["python", "-c", "import sys; print('Usage: python -m backend.main --path /your/project/path')"]
