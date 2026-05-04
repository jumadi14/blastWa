FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
