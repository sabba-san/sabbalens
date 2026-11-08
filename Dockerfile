FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    DATABASE_URL=postgresql+psycopg://sabbalens:sabbalens@db:5432/sabbalens \
    UPLOAD_DIR=/data/uploads \
    DEBUG=false

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY frontend_v1 ./frontend_v1
COPY frontend_landing ./frontend_landing
COPY frontend_v2 ./frontend_v2
COPY frontend_landing_v2 ./frontend_landing_v2
COPY main.py ./main.py

RUN mkdir -p /data/uploads

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --app-dir /app"]