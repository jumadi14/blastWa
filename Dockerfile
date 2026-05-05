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

COPY package.json package-lock.json* ./

RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
