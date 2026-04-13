#!/bin/sh
# const
DB_USER=$DB_USER
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_PASSWORD=$DB_PASSWORD

RCLONE_CONFIG=$RCLONE_CONFIG
BUCKET_NAME=$BUCKET_NAME
R2_BUCKET_NAME=$R2_BUCKET_NAME
BACKUP_PATH=$BACKUP_PATH
TO_GCS=$TO_GCS
TO_R2=$TO_R2

# validate env
if [ -z "$DB_USER" ] || [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_NAME" ] || [ -z "$DB_PASSWORD" ]; then
  echo "Missing database environment variables" >&2
  exit 1
fi

if [ -z "$RCLONE_CONFIG" ] || [ -z "$BACKUP_PATH" ]; then
  echo "Missing storage environment variables" >&2
  exit 1
fi

if [ "$TO_GCS" = "1" ] && [ -z "$BUCKET_NAME" ]; then
  echo "Missing GCS bucket name" >&2
  exit 1
fi

if [ "$TO_R2" = "1" ] && [ -z "$R2_BUCKET_NAME" ]; then
  echo "Missing R2 bucket name" >&2
  exit 1
fi

# validate command
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is not installed or not in PATH" >&2
  exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
  echo "rclone is not installed or not in PATH" >&2
  exit 1
fi

# export db
mkdir -p "$(dirname "$BACKUP_PATH")"
if PGPASSWORD=$DB_PASSWORD pg_dump -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" > "$BACKUP_PATH"; then
  # Sử dụng wc -c để lấy kích thước tệp trên Alpine
  FILE_SIZE=$(wc -c < "$BACKUP_PATH")
  echo "FILE_SIZE: $FILE_SIZE"
  echo "Backup created at $BACKUP_PATH"
else
  echo "Backup failed!" >&2
  exit 1
fi

# to gcs
if [ -n "$TO_GCS" ] && [ "$TO_GCS" = "1" ]; then
  if rclone copy "$BACKUP_PATH" --config="$RCLONE_CONFIG" "gcs:/$BUCKET_NAME/backups/" --progress >/dev/null; then
    echo "Uploaded $BACKUP_PATH to GCS bucket: $BUCKET_NAME"
  else
    echo "Failed when push to GCS" >&2
    exit 1
  fi
fi

# to r2
if [ -n "$TO_R2" ] && [ "$TO_R2" = "1" ]; then
  if rclone copy "$BACKUP_PATH" --config="$RCLONE_CONFIG" "r2:/$R2_BUCKET_NAME/backups/" --progress >/dev/null; then
    echo "Uploaded $BACKUP_PATH to R2 bucket: $R2_BUCKET_NAME"
  else
    echo "Failed when push to R2" >&2
    exit 1
  fi
fi

# delete
if rm -f "$BACKUP_PATH"; then
  echo "Local backup file deleted: $BACKUP_PATH"
fi
