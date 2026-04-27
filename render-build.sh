#!/usr/bin/env bash
# exit on error
set -o errexit

npm install

# Download dan install Chrome manual di environment Render
STORAGE_DIR=/opt/render/project/.render
mkdir -p $STORAGE_DIR

if [[ ! -d $STORAGE_DIR/chrome ]]; then
  echo "... Downloading Chrome ..."
  mkdir -p $STORAGE_DIR/chrome
  cd $STORAGE_DIR/chrome
  wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  dpkg -x google-chrome-stable_current_amd64.deb .
fi

# Set PATH supaya folder bin Chrome terdeteksi
export PATH="${PATH}:${STORAGE_DIR/chrome/opt/google/chrome}"
