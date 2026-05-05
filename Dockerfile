FROM node:20-slim

# 1. Install semua kebutuhan build: git, ssh (penting!), dan compiler untuk libsignal
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. Paksa Git pakai HTTPS secara menyeluruh sebelum menyentuh file apa pun
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf git@github.com: && \
    git config --global url."https://github.com/".insteadOf git://

WORKDIR /app

# 3. Copy package files
COPY package*.json ./

# 4. JURUS PAMUNGKAS: Kita paksa ganti URL di package.json DAN package-lock.json
# Ini untuk memastikan Baileys tidak bisa "ngumpet" pakai protokol SSH
RUN sed -i 's/git+ssh:\/\/git@github.com/https:\/\/github.com/g' package.json && \
    if [ -f package-lock.json ]; then \
    sed -i 's/ssh:\/\/git@github.com/https:\/\/github.com/g' package-lock.json && \
    sed -i 's/git+ssh:\/\/git@github.com/https:\/\/github.com/g' package-lock.json; \
    fi

# 5. Jalankan install
RUN npm install --legacy-peer-deps

# 6. Copy sisa file
COPY . .

ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]
