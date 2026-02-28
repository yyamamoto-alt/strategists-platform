#!/bin/bash
# Vercel デプロイスクリプト（モノレポ対応）
# Usage: ./scripts/deploy.sh [crm|lms|all]

set -e
cd "$(dirname "$0")/.."
ROOT_DIR=$(pwd)

deploy_app() {
  local app=$1
  echo "🚀 Deploying $app..."

  # Create vercel.json for this app
  cat > vercel.json <<EOF
{
  "framework": "nextjs",
  "buildCommand": "npm run build:$app",
  "outputDirectory": "apps/$app/.next",
  "installCommand": "npm install"
}
EOF

  # Link and deploy
  rm -rf .vercel
  vercel link --project "strategists-$app" --yes
  vercel deploy --prod --yes

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
rm -f vercel.json
rm -rf .vercel
echo "🎉 Done!"
