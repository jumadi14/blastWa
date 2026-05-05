FROM node:20-slim

# 1. Install build tools (Baileys butuh ini untuk compile libsignal)
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. Paksa Git global agar TIDAK PERNAH pakai SSH
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf git@github.com: && \
    git config --global url."https://".insteadOf git://

WORKDIR /app

# 3. Copy package.json
COPY package.json ./

# 4. MODIFIKASI PACKAGE.JSON DI DALAM DOCKER
# Kita hapus Baileys dulu dari list, lalu kita install manual pakai HTTPS
RUN sed -i '/"@whiskeysockets\/baileys":/d' package.json

# 5. Install semua library lain dulu
RUN npm install --legacy-peer-deps

# 6. INSTALL BAILEYS SECARA TERPISAH (PAKAI HTTPS LANGSUNG)
# Kita pakai versi 6.6.0 atau latest yang lebih stabil link-nya
RUN npm install @whiskeysockets/baileys@6.6.0 --legacy-peer-deps

COPY . .

ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]
