FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
RUN git config --global url."https://github.com/".insteadOf "git@github.com:"

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

ENV PORT=5000

EXPOSE 5000

CMD ["node", "server.js"]
