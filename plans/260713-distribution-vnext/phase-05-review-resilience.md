# Phase 5 — Bật lại REVIEW gate + resilience

**Priority:** Trung bình · **Status:** ⬜ Chưa (skeleton) · **Chi tiết hoá sau**

## Mục tiêu

Bật gate kiểm duyệt thủ công (theo cờ tenant) + các resilience pattern còn lại.

## Scope (thô)

- REVIEW gate: bước `AWAITING_REVIEW` chèn giữa VALIDATING và PROVISIONING_IDS **chỉ khi** tenant bật `requiresManualReview`. Approve/reject → resume (human signal).
- Bảng `review` + endpoint approve/reject (RBAC).
- Resilience: bulkhead SFTP per host, circuit breaker CI/SFTP, poison detection (giới hạn retry), timeout/deadline mỗi bước.
- RETRY endpoint: chỉ admin (RBAC), reset subtree ISSUES/FAILED → resume, giới hạn số lần.

## Entry / Exit

- **Entry:** engine + ACL ổn (phase 2–4).
- **Exit:** review flow chạy; SFTP nghẽn không kéo sập hệ; retry loop có trần.

## Todo (thô)

- [ ] Cờ tenant requiresManualReview + chèn state có điều kiện
- [ ] Bảng review + endpoint approve/reject + RBAC
- [ ] Bulkhead pool SFTP per host
- [ ] Circuit breaker CI/SFTP
- [ ] Poison detection + trần retry
- [ ] RETRY endpoint admin-only

## Câu hỏi mở

- Ngưỡng retry/poison cụ thể là bao nhiêu? → chốt với nghiệp vụ.
