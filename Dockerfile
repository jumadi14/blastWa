FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# 🔥 PAKSA SSH → HTTPS
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
RUN git config --global url."https://github.com/".insteadOf "git@github.com:"

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
