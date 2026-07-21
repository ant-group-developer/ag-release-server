import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { TicketReason } from '../../domain/value-objects/ticket-ref.vo';

/**
 * ticketIdempotencyKey — STABLE key for TicketService.open() across a channel's retry loop.
 *
 * Khối C fix: earlier code derived the key from `payload.key`, which DRIFTS every orchestrate
 * turn (handler sets payload.key = command.key, and each runner appends ':fail'/':done').
 * A drifting key defeats TicketService idempotency → one failure cycle opened many orphan
 * tickets that Khối E (RETRY) could never resolve.
 *
 * The key is now stable within one RETRY GENERATION and identifies the failure POINT:
 *   `${channelId}:${reason}:g${generation}`
 *
 * · Same channel + same failure reason + same generation → same ticket (idempotent re-run).
 * · `generation` = distribution.retryCount. Admin RESET (Khối E) bumps retryCount, so a fresh
 *   attempt that fails again opens a NEW ticket (the old one is resolved on reset) — no false hit.
 *
 * Deterministic (no Date.now/random) → safe under at-least-once job delivery.
 */
export function ticketIdempotencyKey(
	channelId: string,
	reason: TicketReason,
	generation: number,
): IdempotencyKey {
	return IdempotencyKey.create(`${channelId}:${reason}:g${generation}`);
}
