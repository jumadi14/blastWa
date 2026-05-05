FROM node:20-slim

# 🔥 install dependency penting + SSL cert
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# paksa git pakai HTTPS (bukan SSH)
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
RUN git config --global url."https://github.com/".insteadOf "git@github.com:"

WORKDIR /app

COPY package*.json ./

# install dependency TANPA baileys dulu
RUN sed -i '/"@whiskeysockets\/baileys":/d' package.json
RUN npm install --legacy-peer-deps

# 🔥 install baileys terakhir
RUN npm install @whiskeysockets/baileys@6.7.16 --legacy-peer-deps

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
