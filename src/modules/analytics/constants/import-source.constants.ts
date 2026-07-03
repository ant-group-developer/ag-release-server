/** Map từ raw import_source value → label hiển thị cho người dùng */
export const IMPORT_SOURCE_LABELS: Record<string, string> = {
  ftp: 'Merlin',
  wmg_report: 'WMG',
  spotify_report: 'Spotify',
};

export function getImportSourceLabel(source: string): string {
  return IMPORT_SOURCE_LABELS[source] ?? source;
}
