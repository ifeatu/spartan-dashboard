#!/bin/bash
# deploy.sh — build + deploy spartan-dashboard to SPARTAN NAS
#
# spartan-dashboard is a baked-image agent: the React/Vite frontend is compiled
# into the Docker image at build time, so every deploy requires a full image
# rebuild (docker compose up -d --build). There is no bind-mount shortcut.
#
# Usage:
#   ./deploy.sh [--quick] [--force] [--dry-run]
#
#   --quick     Skip git fetch / ahead-of-origin check
#   --force     Allow deploy with dirty git state or unpushed commits
#   --dry-run   Print actions without executing
#
# Exit codes:
#   0  success
#   2  preflight failure (dirty git, wrong branch, unpushed, missing dir)
#   3  rsync or remote build failure
#   4  post-deploy health check failure
#
# Environment:
#   DASHBOARD_PASS  Basic-auth password for the health-check curl
#                   (default: spartan2026)

set -u
set -o pipefail

# ── Config ────────────────────────────────────────────────────
SSH_ALIAS="synology"
NAS_HOST="192.168.1.19"
NAS_DIR="/volume1/docker/spartan-dashboard"
CONTAINER="spartan-dashboard"
BRANCH="main"
PORT="8780"
HEALTH_PATH="/"
DASHBOARD_PASS="${DASHBOARD_PASS:-spartan2026}"
DOCKER_CMD="sudo /usr/local/bin/docker"
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_DIR="$SCRIPT_DIR"

QUICK=false
FORCE=false
DRY_RUN=false

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --quick)    QUICK=true ;;
    --force)    FORCE=true ;;
    --dry-run)  DRY_RUN=true ;;
    -h|--help)  usage ;;
    -*)         echo "Unknown flag: $1" >&2; usage ;;
    *)          echo "Unknown argument: $1" >&2; usage ;;
  esac
  shift
done

run() {
  if $DRY_RUN; then
    echo "[DRY] $*"
  else
    echo "▶ $*"
    "$@"
  fi
}

ssh_run() {
  if $DRY_RUN; then
    echo "[DRY] ssh $SSH_ALIAS $*"
  else
    echo "▶ ssh $SSH_ALIAS $*"
    ssh "$SSH_ALIAS" "$@"
  fi
}

echo "================================================================"
echo "SPARTAN Deploy — spartan-dashboard"
echo "  container: $CONTAINER"
echo "  local:     $LOCAL_DIR"
echo "  nas:       $SSH_ALIAS:$NAS_DIR"
echo "  branch:    $BRANCH"
echo "  quick:     $QUICK  force: $FORCE  dry-run: $DRY_RUN"
echo "================================================================"

# ── Preflight ─────────────────────────────────────────────────
if [ ! -d "$LOCAL_DIR/.git" ]; then
  echo "ERROR: $LOCAL_DIR is not a git repo" >&2
  exit 2
fi

cd "$LOCAL_DIR"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  echo "ERROR: on branch '$CURRENT_BRANCH', expected '$BRANCH'" >&2
  $FORCE || exit 2
fi

DIRTY=$(git status --porcelain)
if [ -n "$DIRTY" ]; then
  echo "ERROR: working tree dirty:" >&2
  echo "$DIRTY" >&2
  $FORCE || exit 2
fi

if ! $QUICK; then
  git fetch origin --quiet 2>/dev/null || true
  AHEAD=$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)
  if [ "$AHEAD" != "0" ]; then
    echo "WARNING: $AHEAD local commit(s) not pushed to origin/$BRANCH" >&2
    $FORCE || { echo "Push first, or use --force" >&2; exit 2; }
  fi
fi

SHA=$(git rev-parse --short HEAD)
echo "Git: $BRANCH @ $SHA"

# ── Rsync to NAS ──────────────────────────────────────────────
# NEVER use --delete (per deploy rules).
RSYNC_EXCLUDES=(
  --exclude='.git/'
  --exclude='node_modules/'
  --exclude='dist/'
  --exclude='build/'
  --exclude='.DS_Store'
  --exclude='.env'
)

echo ""
echo "▶ rsync → $SSH_ALIAS:$NAS_DIR/"
if $DRY_RUN; then
  rsync -avzn --omit-dir-times "${RSYNC_EXCLUDES[@]}" "$LOCAL_DIR/" "$SSH_ALIAS:$NAS_DIR/" | tail -20
else
  rsync -avz --omit-dir-times "${RSYNC_EXCLUDES[@]}" "$LOCAL_DIR/" "$SSH_ALIAS:$NAS_DIR/" | tail -20
  RSYNC_EXIT="${PIPESTATUS[0]}"
  if [ "$RSYNC_EXIT" -eq 23 ]; then
    # Exit 23 = "partial transfer due to error" — on Synology this fires for
    # harmless "failed to set times on …: Operation not permitted" warnings
    # even when every file transferred cleanly. Safe to continue.
    echo "WARN: rsync exited 23 (harmless permission/timestamp warning on Synology); continuing" >&2
  elif [ "$RSYNC_EXIT" -ne 0 ]; then
    echo "ERROR: rsync failed (exit $RSYNC_EXIT)" >&2
    exit 3
  fi
fi

# ── Remote build + restart ─────────────────────────────────────
# spartan-dashboard is always a baked-image agent: the Vite build is compiled
# into the Docker image, so --build is always required. --force-recreate alone
# would silently serve the old image with stale JavaScript.
echo ""
echo "▶ docker compose up -d --build $CONTAINER on NAS"
ssh_run "cd $NAS_DIR && $DOCKER_CMD compose up -d --build $CONTAINER" || {
  echo "ERROR: remote rebuild failed" >&2
  exit 3
}

# ── Post-deploy health check ───────────────────────────────────
if ! $DRY_RUN; then
  echo ""
  echo "▶ Health check (waiting for container at http://$NAS_HOST:$PORT$HEALTH_PATH)"
  HEALTH_OK=false
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 3
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
      -u "pierre:${DASHBOARD_PASS}" \
      "http://${NAS_HOST}:${PORT}${HEALTH_PATH}" 2>/dev/null || echo "000")
    if [ "$CODE" = "200" ]; then
      echo "  attempt $i: 200 OK"
      HEALTH_OK=true
      break
    fi
    echo "  attempt $i: $CODE"
  done
  if ! $HEALTH_OK; then
    echo "ERROR: post-deploy health check failed after 10 attempts" >&2
    exit 4
  fi
fi

# ── Git tag ────────────────────────────────────────────────────
TAG="deployed/spartan-dashboard/$(date +%Y%m%d-%H%M%S)"
if ! $DRY_RUN; then
  git tag -a "$TAG" -m "deploy spartan-dashboard @ $SHA" 2>/dev/null || true
  git push origin "$TAG" --quiet 2>/dev/null || echo "(warn: tag push failed — continuing)"
fi

echo ""
echo "✅ Deploy complete: spartan-dashboard @ $SHA"
echo "   Tag:  $TAG"
echo "   URL:  https://dashboard.fatu.ai"
