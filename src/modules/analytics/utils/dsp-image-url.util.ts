/** Turns the `picture` key synced from PostgreSQL into the public DSP image URL. */
export function toDspImageUrl(picture?: string | null): string | null {
	if (!picture) return null;
	if (picture.startsWith('http')) return picture;

	const baseUrl = process.env.R2_PUBLIC_BASE_URL || 'default.com';
	return `${baseUrl}/${picture}`;
}
