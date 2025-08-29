#!/bin/bash
# const
DB_USER=$DB_USER
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_PASSWORD=$DB_PASSWORD

RCLONE_CONFIG=$RCLONE_CONFIG
BUCKET_NAME=$BUCKET_NAME
BACKUP_PATH=$BACKUP_PATH

# validate
if [ -z "$DB_USER" ] || [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_NAME" ] || [ -z "$DB_PASSWORD" ]; then
  echo "ERROR: Missing database environment variables"
fi

if [ -z "$RCLONE_CONFIG" ] || [ -z "$BUCKET_NAME" ] || [ -z "$BACKUP_PATH" ]; then
  echo "ERROR: Missing storage environment variables"
fi

# export db
mkdir -p "$(dirname "$BACKUP_PATH")"
PGPASSWORD=$DB_PASSWORD pg_dump -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" > "$BACKUP_PATH"
if [ $? -eq 0 ]; then
  FILE_SIZE=$(stat -c%s "$BACKUP_PATH")
  echo "FILE_SIZE: $FILE_SIZE"
  echo "SUCCESS: Backup created at $BACKUP_PATH"
else
  echo "ERROR: Backup failed!"
fi

# to gcs
rclone copy "$BACKUP_PATH" --config="$RCLONE_CONFIG" "gcs:/$BUCKET_NAME/backups/" --progress
if [ $? -eq 0 ]; then
  echo "SUCCESS: Uploaded $BACKUP_PATH to GCS bucket: $BUCKET_NAME"
else
  echo "ERROR: Failed when push to GCS"
fi

# delete
rm -f "$BACKUP_PATH"
if [ $? -eq 0 ]; then
  echo "SUCCESS: Local backup file deleted: $BACKUP_PATH"
else
  echo "ERROR: Failed to delete local backup file: $BACKUP_PATH"
fi
