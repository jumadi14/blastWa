FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# 🔥 Paksa semua git pakai HTTPS (anti SSH error)
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
RUN git config --global url."https://github.com/".insteadOf "git@github.com:"

WORKDIR /app

COPY package.json ./

# hapus baileys dari package.json
RUN sed -i '/"@whiskeysockets\/baileys":/d' package.json

RUN npm install --legacy-peer-deps

# install baileys dari tarball
RUN npm install https://registry.npmjs.org/@whiskeysockets/baileys/-/baileys-6.7.16.tgz --legacy-peer-deps

COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
