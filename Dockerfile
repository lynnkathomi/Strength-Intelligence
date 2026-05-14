FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app.py .

RUN mkdir -p data

EXPOSE 5000

CMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app"]