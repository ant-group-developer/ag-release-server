/**
 * TicketIssueItem — one standardized issue entry within a ticket.
 *
 * Client renders an array of these as a list — same shape regardless of TicketReason.
 * Runners map CI-specific data (QA flags, import warnings) into this format
 * so the client never needs to switch on reason to render.
 */
export interface TicketIssueItem {
	/** Machine-readable error code (e.g., "AUD001", "ISRC_CONFLICT"). */
	readonly code: string;
	/** Human-readable description (e.g., "Audio Clipping Detected"). */
	readonly message: string;
	/** Severity level — 'error' blocks distribution, 'warning' is informational. */
	readonly severity: 'error' | 'warning';
	/** Where the issue occurred (e.g., "Track 3", "Track 5, Vol 1"). */
	readonly location?: string;
	/** Suggested fix for the user (e.g., "Re-master track 3 to avoid clipping"). */
	readonly suggestion?: string;
}

/**
 * TicketMetadata — structured error data attached to a ticket.
 *
 * Stored as JSONB in `orchestration_ticket.metadata`.
 * `items` is the standardized list the client always renders.
 * `context` holds extra info (UPC, batchId) for debugging/linking — optional to render.
 */
export interface TicketMetadata {
	/** Standardized list of issues — client renders this array as a table/list. */
	readonly items: TicketIssueItem[];
	/** Reason-specific context for debugging/linking (UPC, batchExternalId, etc.). */
	readonly context?: Record<string, unknown>;
}
