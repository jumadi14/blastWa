FROM node:20-slim

# 1. Install git & build tools (penting buat compile library WA)
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. Paksa Git ganti semua SSH ke HTTPS di level sistem
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf git@github.com: && \
    git config --global url."https://github.com/".insteadOf git://

WORKDIR /app

# 3. Copy package files
COPY package*.json ./

# 4. JURUS KUNCI: Paksa ganti string SSH di dalam package-lock.json (jika ada)
# dan bersihkan sisa-sisa install yang gagal
RUN if [ -f package-lock.json ]; then \
    sed -i 's/ssh:\/\/git@github.com/https:\/\/github.com/g' package-lock.json; \
    fi

# 5. Jalankan install dengan flag tambahan untuk bypass masalah peer-deps
RUN npm install --legacy-peer-deps

# 6. Copy sisanya
COPY . .

ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]
