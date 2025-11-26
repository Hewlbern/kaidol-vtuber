FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python service code
COPY main.py .

# Copy backend source (for imports)
COPY ../backend ./backend

# Expose port
EXPOSE 8000

# Run service
CMD ["python", "main.py"]

