/**
 * XML Utility Functions for DDEX Generation
 */

/**
 * Escape special XML characters
 */
export function escapeXml(str: string): string {
	if (!str) return '';
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/**
 * Create an XML element with optional attributes and content
 */
export function element(
	name: string,
	content: string | null,
	attributes?: Record<string, string>,
): string {
	const attrs = attributes
		? ' ' +
			Object.entries(attributes)
				.map(([key, value]) => `${key}="${escapeXml(value)}"`)
				.join(' ')
		: '';

	if (content === null || content === undefined) {
		return `<${name}${attrs}/>`;
	}

	return `<${name}${attrs}>${content}</${name}>`;
}

/**
 * Create an XML element that wraps child elements
 */
export function wrapElement(name: string, children: string): string {
	return `<${name}>\n${indent(children)}\n</${name}>`;
}

/**
 * Indent all lines of a string
 */
export function indent(str: string, spaces: number = 4): string {
	const padding = ' '.repeat(spaces);
	return str
		.split('\n')
		.map((line) => (line.trim() ? padding + line : line))
		.join('\n');
}

/**
 * Convert seconds to ISO 8601 duration format
 * @param seconds Duration in seconds
 * @returns ISO 8601 duration string (e.g., "PT0H3M16S")
 */
export function secondsToIsoDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	return `PT${hours}H${minutes}M${secs}S`;
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date | string): string {
	if (typeof date === 'string') {
		// If already in correct format, return as is
		if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return date;
		}
		date = new Date(date);
	}
	return date.toISOString().split('T')[0];
}

/**
 * Format datetime to ISO 8601 with timezone
 */
export function formatDateTime(date?: Date | string): string {
	if (!date) {
		date = new Date();
	}
	if (typeof date === 'string') {
		date = new Date(date);
	}
	return date.toISOString().replace('Z', '+00:00');
}

/**
 * Generate XML declaration
 */
export function xmlDeclaration(): string {
	return '<?xml version="1.0" encoding="UTF-8"?>';
}
