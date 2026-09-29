FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py algorithms.py mock_feeds.py database.py ./
COPY static ./static

EXPOSE 8000

# gthread workers (built into gunicorn, no extra deps) so the long-lived
# SSE connection on /api/stream doesn't block other requests on the same
# worker the way a plain sync worker would.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8000} --worker-class gthread --workers 2 --threads 8 --timeout 120 app:app"]
