/**
 * Raw row shape sau khi parse CSV header.
 * Header CSV: ISRC | Title | Main Artist(s) | Content provider | Repertoire owner
 *           | Modified date | Channel name | YouTube link | Status | Start Date (UTC)
 */
export interface VideoCsvRow {
	ISRC?: string;
	Title?: string;
	'Main Artist(s)'?: string;
	'Content provider'?: string;
	'Repertoire owner'?: string;
	'Modified date'?: string;
	'Channel name'?: string;
	'YouTube link'?: string;
	Status?: string;
	'Start Date (UTC)'?: string;
}
