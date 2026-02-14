FROM python:3.11-slim

# Install system dependencies required by cadquery / OCP
RUN apt-get update && apt-get install -y \
    git \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first (better caching)
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Railway uses PORT env variable
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT"]
