FROM python:3.11-slim

WORKDIR /app

# Install dependencies first — layer cached unless requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the signal script
COPY signals_run.py .

CMD ["python3", "signals_run.py"]
