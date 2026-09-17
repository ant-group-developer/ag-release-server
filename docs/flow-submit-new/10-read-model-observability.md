# Phase 10 — Read model và observability

## Mục tiêu

Cho UI/dev/reviewer theo dõi tiến độ và truy vết hai chiều.

## Query API

```http
GET /distribution-v2/distributions
GET /distribution-v2/distributions/:id
GET /distribution-v2/distributions/:id/status
GET /distribution-v2/distributions/:id/timeline
GET /distribution-v2/distributions/:id/channels
GET /distribution-v2/distributions/:id/batches
GET /distribution-v2/batches/:id
GET /distribution-v2/batches/:id/members
```

`status` là response nhẹ cho polling.

## Summary

`distribution_summary` lưu:

```text
status
total_channels
live_channels
waiting_channels
issue_channels
current_step
latest_error
updated_at
```

Không load snapshot lớn khi UI chỉ cần progress.

## Timeline

Mỗi event có:

```text
distributionId
channelId
stepId
correlationId
eventType
actor
payload
occurredAt
```

## Metrics

```text
distribution_v2_queue_depth
distribution_v2_step_duration
distribution_v2_retry_total
distribution_v2_sftp_failure_total
distribution_v2_ci_import_problem_total
distribution_v2_qa_blocker_total
distribution_v2_batch_size
distribution_v2_partner_timeout_total
```

## Test/acceptance

- Timeline theo đúng thứ tự xảy ra.
- Progress không phụ thuộc snapshot payload.
- Truy vấn release → batch → external job.
- Truy vấn batch → release/channel.
- Correlation ID xuyên API/log/job.

