FROM python:3.11-slim

# Install Chrome for cookie extraction (optional, for local dev)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp and boto3 for R2 uploads
RUN pip install --no-cache-dir yt-dlp boto3

# Copy server code
COPY server.py /app/server.py
WORKDIR /app

# Expose port for HTTP server
EXPOSE 8080

# Run the server
CMD ["python", "server.py"]
