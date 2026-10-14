#!/usr/bin/env bash
# 라즈베리파이로 소스 동기화 후 빌드/재기동.
# 사용: PI_HOST=pi@raspberrypi.local PI_DIR=~/app/csd ./deploy.sh
set -euo pipefail
PI_HOST="${PI_HOST:?PI_HOST=user@host 를 지정하세요}"
PI_DIR="${PI_DIR:-~/app/csd}"

rsync -az --delete \
  --exclude node_modules --exclude dist --exclude data --exclude data-local \
  --exclude .env --exclude .git --exclude .DS_Store \
  ./ "$PI_HOST:$PI_DIR/"

ssh "$PI_HOST" "cd $PI_DIR \
  && test -f .env || { echo '.env 가 없습니다. .env.example 참고해서 생성하세요'; exit 1; } \
  && mkdir -p data \
  && docker compose up -d --build \
  && docker image prune -f >/dev/null \
  && docker compose ps"
