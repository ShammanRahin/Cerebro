FROM python:3.11-slim

WORKDIR /app

# Build tooling some wheels need; removed after install to keep the layer small
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install the CPU-only PyTorch wheel first so pip doesn't pull the ~2GB CUDA build.
# sentence-transformers then sees torch already satisfied.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
