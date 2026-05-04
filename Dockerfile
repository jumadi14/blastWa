FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# ✅ Convert SSH GitHub ke HTTPS agar tidak butuh SSH key
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
RUN git config --global url."https://github.com/".insteadOf "git@github.com:"

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV PORT=5000

EXPOSE 5000

CMD ["node", "server.js"]
