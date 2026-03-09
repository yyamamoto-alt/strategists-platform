#!/bin/bash
# Vercel デプロイスクリプト（モノレポ対応）
# Usage: ./scripts/deploy.sh [crm|lms|all]

set -e
cd "$(dirname "$0")/.."
ROOT_DIR=$(pwd)

deploy_app() {
  local app=$1
  echo "🚀 Deploying $app..."

  # Backup existing vercel.json
  [ -f vercel.json ] && cp vercel.json vercel.json.bak

  # Create vercel.json for this app
  # CRM includes cron definitions; LMS does not
  if [ "$app" = "crm" ]; then
    cat > vercel.json <<EOF
{
  "framework": "nextjs",
  "buildCommand": "npm run build:crm",
  "outputDirectory": "apps/crm/.next",
  "installCommand": "npm install",
  "crons": [
    { "path": "/api/cron/daily-report", "schedule": "0 0 * * *" },
    { "path": "/api/cron/stage-transitions", "schedule": "0 0 * * *" },
    { "path": "/api/cron/sync-spreadsheets", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/sync-automations", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/sync-analytics", "schedule": "0 15 * * *" },
    { "path": "/api/cron/sales-reminder", "schedule": "0 0 * * *" },
    { "path": "/api/cron/mentor-reminder", "schedule": "0 0 * * *" },
    { "path": "/api/cron/weekly-sales-report", "schedule": "0 1 * * 1" },
    { "path": "/api/cron/ca-reminder", "schedule": "0 0 * * *" },
    { "path": "/api/cron/payment-confirm", "schedule": "0 0 1 * *" },
    { "path": "/api/cron/jicoo-availability", "schedule": "0 0 * * 1,3,5" },
    { "path": "/api/cron/work-status-report", "schedule": "15 0 * * 0" },
    { "path": "/api/cron/mentor-status-report", "schedule": "30 0 * * 0" },
    { "path": "/api/cron/coaching-consumption-alert", "schedule": "0 0 1 * *" },
    { "path": "/api/cron/student-reminder", "schedule": "0 0 * * *" },
    { "path": "/api/cron/coaching-start-notification", "schedule": "0 0 * * *" }
  ]
}
EOF
  else
    cat > vercel.json <<EOF
{
  "framework": "nextjs",
  "buildCommand": "npm run build:$app",
  "outputDirectory": "apps/$app/.next",
  "installCommand": "npm install"
}
EOF
  fi

  # Link and deploy
  rm -rf .vercel
  vercel link --project "strategists-$app" --yes
  vercel deploy --prod --yes

  # Restore original vercel.json
  if [ -f vercel.json.bak ]; then
    mv vercel.json.bak vercel.json
  else
    rm -f vercel.json
  fi

  echo "✅ $app deployed successfully"
}

case "${1:-all}" in
  crm)
    deploy_app crm
    ;;
  lms)
    deploy_app lms
    ;;
  all)
    deploy_app crm
    deploy_app lms
    ;;
  *)
    echo "Usage: $0 [crm|lms|all]"
    exit 1
    ;;
esac

# Cleanup
rm -rf .vercel
echo "🎉 Done!"
