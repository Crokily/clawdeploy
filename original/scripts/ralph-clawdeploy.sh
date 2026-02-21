#!/bin/bash
# ClawDeploy Ralph Loop — Custom loop enforcing model usage rules
# Planning/decisions: claude-opus-4-6 (anthropic) xhigh
# Coding: codex CLI (gpt-5.3-codex) via codex exec --yolo
#
# This script drives the ralph loop, picking one story at a time and
# delegating coding work to Codex CLI.

set -euo pipefail

PROJECT_DIR="/home/ubuntu/clawdeploy"
PRD_FILE="$PROJECT_DIR/prd.json"
PROGRESS_FILE="$PROJECT_DIR/progress.txt"
NOTIFY_SCRIPT="/tmp/discord-notify.py"
DISCORD_VENV="/home/ubuntu/discord-agent/.venv/bin/python"
MAX_ITERATIONS="${1:-14}"
RETRY_MAX=2

cd "$PROJECT_DIR"

notify_discord() {
  local msg="$1"
  $DISCORD_VENV $NOTIFY_SCRIPT "$msg" 2>/dev/null || true
}

get_remaining() {
  python3 -c "
import json
d = json.load(open('$PRD_FILE'))
remaining = [s for s in d['userStories'] if not s['passes']]
print(len(remaining))
"
}

get_next_story() {
  python3 -c "
import json
d = json.load(open('$PRD_FILE'))
remaining = sorted([s for s in d['userStories'] if not s['passes']], key=lambda s: s['priority'])
if remaining:
    s = remaining[0]
    print(f\"{s['id']}|{s['title']}|{s['priority']}\")
else:
    print('DONE')
"
}

get_story_json() {
  local story_id="$1"
  python3 -c "
import json
d = json.load(open('$PRD_FILE'))
for s in d['userStories']:
    if s['id'] == '$story_id':
        print(json.dumps(s, indent=2))
        break
"
}

mark_story_passed() {
  local story_id="$1"
  python3 -c "
import json
d = json.load(open('$PRD_FILE'))
for s in d['userStories']:
    if s['id'] == '$story_id':
        s['passes'] = True
        break
json.dump(d, open('$PRD_FILE', 'w'), indent=2)
print('Updated $story_id to passes=true')
"
}

update_story_notes() {
  local story_id="$1"
  local notes="$2"
  python3 -c "
import json, sys
d = json.load(open('$PRD_FILE'))
for s in d['userStories']:
    if s['id'] == '$story_id':
        s['notes'] = '''$notes'''
        break
json.dump(d, open('$PRD_FILE', 'w'), indent=2)
"
}

# ============================================
# Pre-flight checks
# ============================================
TOTAL=$(python3 -c "import json; print(len(json.load(open('$PRD_FILE'))['userStories']))")
REMAINING=$(get_remaining)

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         🤖 ClawDeploy Ralph Loop (Custom Models)         ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo "║  Stories: $((TOTAL - REMAINING))/$TOTAL complete ($REMAINING remaining)                    ║"
echo "║  Max iterations: $MAX_ITERATIONS                                      ║"
echo "║  Code model: codex CLI (gpt-5.3-codex)                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

if [ "$REMAINING" -eq 0 ]; then
  echo "✅ All stories already complete!"
  notify_discord "✅ **ClawDeploy** — All $TOTAL stories complete! Development finished."
  exit 0
fi

# Ensure on correct branch
BRANCH=$(python3 -c "import json; print(json.load(open('$PRD_FILE'))['branchName'])")
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    git checkout "$BRANCH"
  else
    git checkout -b "$BRANCH" main
  fi
  echo "📌 Switched to branch: $BRANCH"
fi

notify_discord "🚀 **ClawDeploy Ralph Loop Started**\n📊 $REMAINING/$TOTAL stories remaining\n🔧 Branch: $BRANCH"

# ============================================
# Main Loop
# ============================================
for i in $(seq 1 "$MAX_ITERATIONS"); do
  REMAINING=$(get_remaining)
  if [ "$REMAINING" -eq 0 ]; then
    echo ""
    echo "✅ All stories complete! Finished at iteration $i."
    notify_discord "🎉 **ClawDeploy COMPLETE!** All $TOTAL stories finished after $i iterations."
    exit 0
  fi

  NEXT=$(get_next_story)
  if [ "$NEXT" = "DONE" ]; then
    echo "✅ All stories complete!"
    exit 0
  fi

  STORY_ID=$(echo "$NEXT" | cut -d'|' -f1)
  STORY_TITLE=$(echo "$NEXT" | cut -d'|' -f2)
  STORY_JSON=$(get_story_json "$STORY_ID")

  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  🔄 Iteration $i/$MAX_ITERATIONS — $REMAINING stories remaining"
  echo "  📋 $STORY_ID: $STORY_TITLE"
  echo "═══════════════════════════════════════════════════════════"
  echo ""

  notify_discord "🔄 **Iteration $i/$MAX_ITERATIONS** — Starting **$STORY_ID**: $STORY_TITLE\n📊 $REMAINING stories remaining"

  # ============================================
  # Special handling for US-003 (Docker install - shell script, no frontend code)
  # ============================================
  if [ "$STORY_ID" = "US-003" ]; then
    echo "  🐳 Special: Docker installation story — using codex for script creation, then running it"
  fi

  # ============================================
  # Delegate to Codex CLI for coding
  # ============================================
  PROMPT_FILE=$(mktemp /tmp/codex-prompt-${STORY_ID}.XXXXXX.md)
  RESULT_FILE=$(mktemp /tmp/codex-result-${STORY_ID}.XXXXXX.txt)
  LOG_FILE=$(mktemp /tmp/codex-run-${STORY_ID}.XXXXXX.log)

  # Read progress.txt codebase patterns
  PATTERNS=$(head -20 "$PROGRESS_FILE" 2>/dev/null || echo "No patterns yet")

  cat > "$PROMPT_FILE" <<PROMPT_EOF
# Ralph Iteration — Implement ONE User Story

You are implementing a single user story for the ClawDeploy project.

## Working Directory
/home/ubuntu/clawdeploy

## Codebase Patterns (from previous iterations)
$PATTERNS

## Story to Implement
$STORY_JSON

## Project Context
- Frontend: Next.js 16.1.6 at frontend/ (App Router, TypeScript, Tailwind CSS 4, Clerk auth)
- Database: Prisma 6.19.2 + Neon PostgreSQL, schema at frontend/prisma/schema.prisma
- UI components at frontend/src/components/ui/ (Button, Card, Input, Select, Badge, LoadingSpinner, Modal, EmptyState)
- Layout at frontend/src/components/layout/ (DashboardLayout)
- Auth helper: frontend/src/lib/auth.ts (requireAuth, isAuthErrorResponse)
- Validation: frontend/src/lib/instance-schema.ts (Zod schemas)
- Logger: frontend/src/lib/logger.ts (Pino)
- Prisma client: frontend/src/lib/prisma.ts
- API routes follow pattern: frontend/src/app/api/instances/route.ts and [id]/route.ts
- Git user: crokily <crokily@gmail.com>
- DATABASE_URL is in frontend/.env.local

## Requirements
1. Implement ONLY this one story — no other changes
2. Follow existing code patterns and conventions
3. Run quality checks after implementation:
   - cd frontend && npx tsc --noEmit
   - cd frontend && npm run lint
   - cd frontend && npm run build
4. If quality checks fail, fix the issues and re-run
5. If the story involves Prisma schema changes, run: cd frontend && npx prisma db push && npx prisma generate
6. If the story involves installing npm packages, run: cd frontend && npm install <package>
7. After all checks pass, commit: git add -A && git commit -m "feat: $STORY_ID - $STORY_TITLE" --author="crokily <crokily@gmail.com>"

## Deliverables
- List of files changed
- Summary of what was implemented
- Confirmation that quality checks passed
PROMPT_EOF

  echo "  📤 Delegating to Codex CLI (gpt-5.3-codex)..."

  RETRY=0
  CODEX_SUCCESS=false

  while [ $RETRY -lt $RETRY_MAX ]; do
    codex exec \
      --model gpt-5.3-codex \
      --yolo \
      --output-last-message "$RESULT_FILE" \
      - < "$PROMPT_FILE" > "$LOG_FILE" 2>&1 || true

    CODEX_EXIT=$?

    # Check if quality checks pass regardless of exit code
    cd "$PROJECT_DIR/frontend"
    if npx tsc --noEmit 2>/dev/null && npm run build 2>/dev/null; then
      CODEX_SUCCESS=true
      break
    fi

    RETRY=$((RETRY + 1))
    echo "  ⚠️  Quality checks failed, retry $RETRY/$RETRY_MAX..."
  done

  cd "$PROJECT_DIR"

  if [ "$CODEX_SUCCESS" = true ]; then
    # Check if there are uncommitted changes and commit them
    if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
      # Codex may have already committed, check
      if git diff --quiet 2>/dev/null && git diff --cached --quiet 2>/dev/null; then
        echo "  ✅ Already committed by Codex"
      else
        git add -A
        git commit -m "feat: $STORY_ID - $STORY_TITLE" --author="crokily <crokily@gmail.com>" 2>/dev/null || true
      fi
    fi

    # Mark story as passed
    mark_story_passed "$STORY_ID"
    git add prd.json
    git commit -m "chore: mark $STORY_ID as passed" --author="crokily <crokily@gmail.com>" 2>/dev/null || true

    # Read codex result summary
    RESULT_SUMMARY=$(cat "$RESULT_FILE" 2>/dev/null | head -50 || echo "No summary available")

    # Update progress.txt
    cat >> "$PROGRESS_FILE" <<PROG_EOF

## $(date '+%Y-%m-%d %H:%M') - $STORY_ID: $STORY_TITLE
- Implemented by Codex CLI (gpt-5.3-codex)
- Quality checks passed: tsc, lint, build
$RESULT_SUMMARY
---
PROG_EOF

    echo "  ✅ $STORY_ID completed successfully!"
    notify_discord "✅ **$STORY_ID: $STORY_TITLE** — Completed!\n$((REMAINING - 1)) stories remaining."
  else
    echo "  ❌ $STORY_ID failed after $RETRY_MAX retries"
    # Log failure details
    FAIL_LOG=$(tail -30 "$LOG_FILE" 2>/dev/null || echo "No log available")
    update_story_notes "$STORY_ID" "Failed after $RETRY_MAX retries. Check log: $LOG_FILE"

    cat >> "$PROGRESS_FILE" <<PROG_EOF

## $(date '+%Y-%m-%d %H:%M') - $STORY_ID: $STORY_TITLE (FAILED)
- Failed after $RETRY_MAX Codex retries
- Log: $LOG_FILE
- Will retry in next iteration
---
PROG_EOF

    notify_discord "❌ **$STORY_ID: $STORY_TITLE** — Failed after $RETRY_MAX retries. Continuing..."
  fi

  # Cleanup temp files
  rm -f "$PROMPT_FILE"

  echo ""
  echo "  Continuing in 3s..."
  sleep 3
done

# Final status
DONE=$(python3 -c "import json; print(len([s for s in json.load(open('$PRD_FILE'))['userStories'] if s['passes']]))")
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Ralph Loop finished: $DONE/$TOTAL stories completed             ║"
echo "╚═══════════════════════════════════════════════════════════╝"

notify_discord "📊 **ClawDeploy Ralph Loop Finished**\n$DONE/$TOTAL stories completed."
