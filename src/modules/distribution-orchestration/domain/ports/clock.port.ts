/**
 * Clock — the domain reads time through this port, never `new Date()` directly.
 * Keeps the domain pure + lets tests inject a fixed time. Adapter (phase 4) wraps the system clock.
 */
export interface Clock {
	now(): Date;
}
