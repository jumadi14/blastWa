FROM node:20-slim

# 1. Install build tools
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# 2. Paksa SEMUA protokol git ke HTTPS di level OS
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf git@github.com: && \
    git config --global url."https://".insteadOf git://

WORKDIR /app

# 3. Environment Variable ini akan memaksa NPM untuk tidak menggunakan SSH
# Kita arahkan SSH ke 'true' (perintah yang selalu berhasil tapi tidak melakukan apa-apa)
# agar git tidak mencoba melakukan koneksi asli
ENV GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no"

COPY package.json ./

# 4. HAPUS BAILEYS DARI PACKAGE.JSON (Penting!)
# Kita tidak ingin npm install pertama kali menyentuh Baileys sama sekali
RUN sed -i '/"@whiskeysockets\/baileys":/d' package.json

# 5. Install semua yang aman-aman dulu
RUN npm install --legacy-peer-deps

# 6. JURUS PAMUNGKAS: Install Baileys tanpa menggunakan git internal mereka
# Kita pakai flag --omit=dev untuk menghindari instalasi 'eslint-config' yang bermasalah itu
RUN npm install @whiskeysockets/baileys@6.7.16 --legacy-peer-deps --omit=dev

COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
