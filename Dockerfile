FROM node:20-slim

# 1. Build tools tetap butuh buat compile libsignal
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Copy package.json
COPY package.json ./

# 3. HAPUS BAILEYS DARI LIST (Kita akan install manual tanpa Git)
RUN sed -i '/"@whiskeysockets\/baileys":/d' package.json

# 4. Install dependency lainnya
RUN npm install --legacy-peer-deps

# 5. JURUS ANTI-SSH: Install Baileys langsung dari file Tarball HTTPS
# Ini akan download file .tgz, jadi NPM tidak akan pernah panggil perintah 'git' atau 'ssh'
RUN npm install https://registry.npmjs.org/@whiskeysockets/baileys/-/baileys-6.7.16.tgz --legacy-peer-deps

COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
