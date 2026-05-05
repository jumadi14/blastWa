FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# KONFIGURASI KRUSIAL: Memaksa Git mengganti protokol di level sistem paling dalam
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf git@github.com: && \
    git config --global url."https://github.com/".insteadOf git://github.com/

WORKDIR /app

COPY package*.json ./

# Hapus sisa-sisa yang mungkin bikin error
RUN rm -rf node_modules package-lock.json

# PAKAI ENV INI: Memaksa npm menggunakan HTTPS untuk semua git repository
# dan mengabaikan SSH sepenuhnya saat instalasi
ENV GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no"

# Kita coba ganti semua ssh:// menjadi https:// di package.json secara paksa sebelum install
RUN sed -i 's/git+ssh:\/\/git@github.com/https:\/\/github.com/g' package.json && \
    sed -i 's/ssh:\/\/git@github.com/https:\/\/github.com/g' package.json

RUN npm install --legacy-peer-deps

COPY . .

ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]
