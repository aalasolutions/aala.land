#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LLM_DIR="$ROOT_DIR/.codex"
TASKS_FILE="$LLM_DIR/TASKS.md"
PROJECT_MEMORY="$LLM_DIR/memory/project.md"
DATE_NOW="$(date +%F)"
AGENT_TAG="AGENT:@codex"

usage() {
  cat <<'EOF'
Usage:
  scripts/codex.sh claim "Task title"
  scripts/codex.sh done "Task title"
  scripts/codex.sh log "AREA" "DETAIL"
  scripts/codex.sh decision "DECISION" "WHY" "CONSEQUENCES"
  scripts/codex.sh incident "ISSUE" "ROOT CAUSE" "STATUS"
EOF
}

ensure_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
}

prepend_line() {
  local file="$1"
  local line="$2"
  local tmp
  tmp="$(mktemp)"
  {
    printf '%s\n' "$line"
    cat "$file"
  } >"$tmp"
  mv "$tmp" "$file"
}

insert_after_heading() {
  local file="$1"
  local heading="$2"
  local line="$3"
  awk -v heading="$heading" -v line="$line" '
    $0 == heading && !done {
      print
      print line
      done = 1
      next
    }
    { print }
  ' "$file" >"$file.tmp"
  mv "$file.tmp" "$file"
}

claim_task() {
  local title="$1"
  ensure_file "$TASKS_FILE"
  prepend_line "$TASKS_FILE" "- [ ] $AGENT_TAG | $title | $DATE_NOW pending"
}

complete_task() {
  local title="$1"
  ensure_file "$TASKS_FILE"
  awk -v title="$title" -v date_now="$DATE_NOW" -v agent="$AGENT_TAG" '
    $0 == "- [ ] " agent " | " title " | " date_now " pending" {
      print "- [x] " agent " | " title " | " date_now " | " date_now " done"
      found = 1
      next
    }
    { print }
    END {
      if (!found) exit 1
    }
  ' "$TASKS_FILE" >"$TASKS_FILE.tmp"
  mv "$TASKS_FILE.tmp" "$TASKS_FILE"
}

log_project() {
  local area="$1"
  local detail="$2"
  ensure_file "$PROJECT_MEMORY"
  insert_after_heading "$PROJECT_MEMORY" "## Log" "$DATE_NOW | $AGENT_TAG | $area | $detail"
}

log_decision() {
  local decision="$1"
  local why="$2"
  local consequences="$3"
  ensure_file "$PROJECT_MEMORY"
  insert_after_heading "$PROJECT_MEMORY" "## Decisions" "$DATE_NOW | $AGENT_TAG | $decision | $why | $consequences"
}

log_incident() {
  local issue="$1"
  local cause="$2"
  local status="$3"
  local incidents_file="$LLM_DIR/memory/incidents.md"
  ensure_file "$incidents_file"
  insert_after_heading "$incidents_file" "## Active" "- $DATE_NOW | $AGENT_TAG | $issue | $cause | $status"
}

main() {
  if [ $# -lt 1 ]; then
    usage
    exit 1
  fi

  case "$1" in
    claim)
      [ $# -eq 2 ] || { usage; exit 1; }
      claim_task "$2"
      ;;
    done)
      [ $# -eq 2 ] || { usage; exit 1; }
      complete_task "$2"
      ;;
    log)
      [ $# -eq 3 ] || { usage; exit 1; }
      log_project "$2" "$3"
      ;;
    decision)
      [ $# -eq 4 ] || { usage; exit 1; }
      log_decision "$2" "$3" "$4"
      ;;
    incident)
      [ $# -eq 4 ] || { usage; exit 1; }
      log_incident "$2" "$3" "$4"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
