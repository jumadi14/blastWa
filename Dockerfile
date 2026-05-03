# Gunakan image Puppeteer yang sudah include Chrome dan Node.js
FROM ghcr.io/puppeteer/puppeteer:latest

# Pindah ke user root agar bisa install-install
USER root

# Tentukan folder kerja
WORKDIR /app

# Set environment variable SEBELUM npm install agar skip download Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Copy package.json dan install library
COPY package*.json ./
RUN npm install

# Copy semua file kodingan kamu
COPY . .

# Port aplikasi
EXPOSE 3000

# Jalankan server
CMD ["node", "server.js"]
