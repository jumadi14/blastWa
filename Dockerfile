FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# PAKAI TRIK INI: Kasih tanda bintang di package-lock
# Artinya: "Copy package.json, dan JIKA ADA, copy juga package-lock.json"
COPY package.json package-lock.json* ./

# Tambahkan ini supaya Baileys gak error Permission Denied lagi
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/

RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
