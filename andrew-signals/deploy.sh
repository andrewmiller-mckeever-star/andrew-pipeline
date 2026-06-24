#!/usr/bin/env bash
# deploy.sh — One-time setup + deploy for Andrew's usage signal Cloud Run job.
#
# Run once to set up. Re-run any time to redeploy after code changes.
#
# Prerequisites:
#   1. Install gcloud:  brew install --cask google-cloud-sdk
#   2. Authenticate:    gcloud auth login          (use andrew.miller-mckeever@you.com)
#   3. Create project:  gcloud projects create andrew-sales-toolkit --name="Andrew Sales Toolkit"
#   4. Set billing:     https://console.cloud.google.com/billing — link a billing account
#                       (required for Cloud Run; estimated cost < $1/month)
#   5. Set project:     gcloud config set project andrew-sales-toolkit
#   6. Run this script: bash deploy.sh

set -euo pipefail

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [[ -z "${PROJECT_ID}" ]]; then
  echo "❌ No project set. Run: gcloud config set project andrew-sales-toolkit"
  exit 1
fi

REGION=us-central1
JOB_NAME=andrew-signals
IMAGE=gcr.io/${PROJECT_ID}/${JOB_NAME}
SA_NAME=andrew-signals
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
STATE_BUCKET="${PROJECT_ID}-signals-state"

# Schedule: Mon-Fri 8:00 AM Pacific
SCHEDULE="0 8 * * 1-5"
TIMEZONE="America/Los_Angeles"

echo "═══════════════════════════════════════════════════"
echo "  Andrew's Usage Signals — Cloud Run Setup"
echo "  Project : ${PROJECT_ID}"
echo "  Region  : ${REGION}"
echo "  Job     : ${JOB_NAME}"
echo "  Schedule: ${SCHEDULE} ${TIMEZONE}"
echo "═══════════════════════════════════════════════════"
echo

# ── 1. Enable required APIs ───────────────────────────────────────────────────
echo "▶ Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  containerregistry.googleapis.com \
  --project="${PROJECT_ID}" \
  --quiet
echo "  Done"

# ── 2. Service account ────────────────────────────────────────────────────────
echo "▶ Creating service account ${SA_EMAIL}..."
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="Andrew Signals Job" \
  --project="${PROJECT_ID}" 2>/dev/null \
  || echo "  (already exists, continuing)"

# ── 3. GCS state bucket ───────────────────────────────────────────────────────
echo "▶ Ensuring GCS state bucket gs://${STATE_BUCKET}..."
if ! gsutil ls -b "gs://${STATE_BUCKET}" &>/dev/null; then
  gsutil mb -p "${PROJECT_ID}" -l "${REGION}" "gs://${STATE_BUCKET}"
  echo "  Created"
else
  echo "  Already exists"
fi
gsutil iam ch "serviceAccount:${SA_EMAIL}:roles/storage.objectAdmin" \
  "gs://${STATE_BUCKET}"
echo "  Granted objectAdmin to ${SA_EMAIL}"

# ── 4. Secrets ────────────────────────────────────────────────────────────────
# Reads from local .env if present; otherwise prompts interactively.

DOTENV_FILE="$(dirname "$0")/.env"

source_dotenv() {
  local key="$1"
  local val=""
  if [[ -f "${DOTENV_FILE}" ]]; then
    val=$(grep -E "^${key}=" "${DOTENV_FILE}" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'" || true)
  fi
  if [[ -z "${val}" ]]; then
    read -r -s -p "  Enter ${key}: " val; echo
  fi
  echo "${val}"
}

create_or_update_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "${name}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "  Updating ${name}..."
    echo -n "${value}" | gcloud secrets versions add "${name}" --data-file=- --project="${PROJECT_ID}" --quiet
  else
    echo "  Creating ${name}..."
    echo -n "${value}" | gcloud secrets create "${name}" --data-file=- --project="${PROJECT_ID}" --quiet
  fi
  gcloud secrets add-iam-policy-binding "${name}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" --quiet
}

echo "▶ Storing secrets in Secret Manager..."
SF_USERNAME=$(source_dotenv SF_USERNAME)
SF_PASSWORD=$(source_dotenv SF_PASSWORD)
SF_SECURITY_TOKEN=$(source_dotenv SF_SECURITY_TOKEN)
SLACK_BOT_TOKEN=$(source_dotenv SLACK_BOT_TOKEN)

create_or_update_secret "andrew-sf-username"     "${SF_USERNAME}"
create_or_update_secret "andrew-sf-password"     "${SF_PASSWORD}"
create_or_update_secret "andrew-sf-token"        "${SF_SECURITY_TOKEN}"
create_or_update_secret "andrew-slack-bot-token" "${SLACK_BOT_TOKEN}"

# YDC_API_KEY is optional — enables LinkedIn profile lookups in alert messages
read -r -p "  Enter YDC_API_KEY (press Enter to skip LinkedIn lookups): " YDC_API_KEY_VAL
if [[ -n "${YDC_API_KEY_VAL}" ]]; then
  create_or_update_secret "andrew-ydc-api-key" "${YDC_API_KEY_VAL}"
  YDC_SECRET_FLAG=",YDC_API_KEY=andrew-ydc-api-key:latest"
else
  echo "  Skipping YDC_API_KEY — LinkedIn lookups will be disabled"
  YDC_SECRET_FLAG=""
fi

# ── 5. Build Docker image ─────────────────────────────────────────────────────
echo "▶ Building Docker image..."
gcloud builds submit "$(dirname "$0")" \
  --tag "${IMAGE}" \
  --project="${PROJECT_ID}" \
  --quiet

# ── 6. Deploy Cloud Run job ───────────────────────────────────────────────────
echo "▶ Deploying Cloud Run job '${JOB_NAME}'..."
gcloud run jobs deploy "${JOB_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --service-account "${SA_EMAIL}" \
  --set-secrets="SF_USERNAME=andrew-sf-username:latest,SF_PASSWORD=andrew-sf-password:latest,SF_SECURITY_TOKEN=andrew-sf-token:latest,SLACK_BOT_TOKEN=andrew-slack-bot-token:latest${YDC_SECRET_FLAG}" \
  --set-env-vars="BURST_STATE_BUCKET=${STATE_BUCKET}" \
  --max-retries 1 \
  --task-timeout 10m \
  --project="${PROJECT_ID}" \
  --quiet

# ── 7. Grant Cloud Run invoker role ──────────────────────────────────────────
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.invoker" \
  --quiet

# ── 8. Cloud Scheduler ────────────────────────────────────────────────────────
echo "▶ Setting up Cloud Scheduler (${SCHEDULE} ${TIMEZONE})..."

JOB_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run"

if gcloud scheduler jobs describe andrew-signals-daily \
    --location="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "  Updating existing scheduler job..."
  gcloud scheduler jobs update http andrew-signals-daily \
    --location="${REGION}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${TIMEZONE}" \
    --uri="${JOB_URI}" \
    --http-method=POST \
    --oauth-service-account-email="${SA_EMAIL}" \
    --project="${PROJECT_ID}" \
    --quiet
else
  gcloud scheduler jobs create http andrew-signals-daily \
    --location="${REGION}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${TIMEZONE}" \
    --uri="${JOB_URI}" \
    --http-method=POST \
    --oauth-service-account-email="${SA_EMAIL}" \
    --project="${PROJECT_ID}" \
    --quiet
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo
echo "═══════════════════════════════════════════════════"
echo "  ✅ Setup complete!"
echo
echo "  Job fires Mon-Fri 8am Pacific."
echo "  Posts to #automated-outbound-skills-and-routines when signals fire."
echo "  Silent on no-signal days."
echo
echo "  Test immediately (dry-run, no SFDC needed):"
echo "    gcloud run jobs execute ${JOB_NAME} --region ${REGION} --wait \\"
echo "      --update-env-vars=DRY_RUN=true"
echo
echo "  Or test locally first:"
echo "    cd andrew-signals && python3 signals_run.py --simulate"
echo "    python3 signals_run.py --dry-run"
echo
echo "  Redeploy after code changes:"
echo "    bash deploy.sh"
echo
echo "  View logs:"
echo "    gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}' \\"
echo "      --project=${PROJECT_ID} --limit 50"
echo "═══════════════════════════════════════════════════"
