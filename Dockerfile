FROM node:20-slim

# install build tools (buat libsignal dll)
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copy dependency dulu (biar cache optimal)
COPY package.json package-lock.json* ./

# install semua dependency (TERMASUK baileys dari package.json)
RUN npm install --legacy-peer-deps

# copy source code
COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
