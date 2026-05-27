FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY data ./data
COPY models ./models
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

ENV PYTHONPATH=/app/backend
ENV PORT=8000

EXPOSE 8000

CMD ["./start.sh"]
