FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# TRICK: Pakai 'sed' untuk paksa ganti semua string ssh:// ke https:// 
# langsung di dalam file package-lock.json sebelum npm install jalan.
RUN if [ -f package-lock.json ]; then \
    sed -i 's/ssh:\/\/git@github.com\//https:\/\/github.com\//g' package-lock.json && \
    sed -i 's/git+ssh:\/\/git@github.com\//https:\/\/github.com\//g' package-lock.json; \
    fi

# Tetap pasang config git sebagai backup
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf git@github.com:

RUN npm install --legacy-peer-deps

COPY . .

ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]
