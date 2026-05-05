FROM node:20-slim

# Install git dan openssh
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Konfigurasi Git untuk memaksa semua koneksi SSH ke HTTPS
# Ini solusi utama untuk masalah 'Permission denied (publickey)'
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf git@github.com: && \
    git config --global url."https://".insteadOf git://

WORKDIR /app

# Copy file dependency dulu agar bisa memanfaatkan Docker Cache
COPY package*.json ./

# Jalankan install dengan pembersihan cache agar benar-benar fresh
RUN npm install --legacy-peer-deps && npm cache clean --force

# Copy seluruh source code project
COPY . .

# Set environment variable
ENV PORT=5000

# Ekspos port sesuai aplikasi
EXPOSE 5000

# Jalankan aplikasi
CMD ["node", "server.js"]
