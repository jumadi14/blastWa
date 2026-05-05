FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./

# hapus baileys
RUN sed -i '/"@whiskeysockets\/baileys":/d' package.json

RUN npm install --legacy-peer-deps

# install baileys
RUN npm install https://registry.npmjs.org/@whiskeysockets/baileys/-/baileys-6.7.16.tgz --legacy-peer-deps

COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
