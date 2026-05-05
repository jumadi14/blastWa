FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Paksa Git pakai HTTPS secara global untuk semua protokol
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf git@github.com: && \
    git config --global url."https://github.com/".insteadOf git://github.com/

WORKDIR /app

# COPY hanya package.json saja (abaikan lock file dulu untuk sementara)
COPY package.json ./

# Hapus paksa jika ada sisa-sisa node_modules atau lock file yang terbawa
RUN rm -rf node_modules package-lock.json

# Jalankan install. Tanpa package-lock.json, npm akan mencari versi terbaru 
# via HTTPS sesuai config git di atas.
RUN npm install --legacy-peer-deps

# Baru copy semua file lainnya
COPY . .

ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]
