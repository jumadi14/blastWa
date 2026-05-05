FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Paksa Git pakai HTTPS (Wajib buat Baileys)
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/

# 2. Copy package.json saja dulu
COPY package.json ./

# 3. Hapus Baileys dari package.json (biar bersih) lalu install ulang secara manual
RUN sed -i '/"@whiskeysockets\/baileys":/d' package.json
RUN npm install --legacy-peer-deps
RUN npm install @whiskeysockets/baileys@6.7.16 --legacy-peer-deps

# 4. Baru copy semua file project
COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
