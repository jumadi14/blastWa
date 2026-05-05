FROM node:20-slim

# 1. Pastikan repo update dan install ssh & git di awal
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 2. Paksa git pakai HTTPS (Global)
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf git@github.com:

WORKDIR /app

# 3. Copy package.json saja
COPY package.json ./

# 4. Hapus baileys dari package.json supaya npm install pertama lancar
RUN sed -i '/"@whiskeysockets\/baileys":/d' package.json

# 5. Install depedency lain
RUN npm install --legacy-peer-deps

# 6. Install Baileys secara terpisah
# Kuncinya ada di sini: Baileys v6.7.x sering narik repo 'adiwajshing/libsignal-node'
# Kita paksa dia install lewat HTTPS
RUN npm install @whiskeysockets/baileys@6.7.16 --legacy-peer-deps

COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
