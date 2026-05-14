FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y build-essential rustc && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app.py .

RUN mkdir -p data

EXPOSE 5000

CMD ["python", "app.py"]