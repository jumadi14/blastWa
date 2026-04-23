# Gunakan image Puppeteer yang sudah include Chrome dan Node.js
FROM ghcr.io/puppeteer/puppeteer:latest

# Pindah ke user root agar bisa install-install
USER root

# Tentukan folder kerja
WORKDIR /app

# Copy package.json dan install library
COPY package*.json ./
RUN npm install

# Copy semua file kodingan kamu
COPY . .

# Set environment variable agar Puppeteer tahu lokasi Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Port aplikasi
EXPOSE 3000

# Jalankan server
CMD ["node", "server.js"]
