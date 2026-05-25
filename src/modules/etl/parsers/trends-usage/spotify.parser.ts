import { BaseParser } from '../base.parser';
import { FactDspRow } from '../../interfaces';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Spotify Parser
 * 3 sub-folders with different report types:
 *   - monthly-msen: Monthly playlist stream share (CSV, no ISRC — skip for now)
 *   - weekly-prrt:  Weekly pro-rata market share by country (TSV, no ISRC — aggregate only)
 *   - weekly-topd:  Weekly top tracks by demographics (CSV, has ISRC)
 *   - weekly-chrt:  Weekly chart data (if present)
 *
 * Primary import: weekly-topd (has ISRC, streams, demographics)
 * Aggregate:      weekly-prrt (market share by country, stored as metadata)
 * Skip:           monthly-msen (no ISRC, playlist-level aggregates)
 */
export class SpotifyParser extends BaseParser {
  constructor() {
    super('spotify');
  }

  private processedFolders = new Set<string>();

  async parseFile(filePath: string, batchId: string): Promise<FactDspRow[]> {
    // Spotify has sub-folders, so the folder passed to EtlService is spo-spotify
    // but individual files are in sub-folders. Detect and handle.
    const folder = path.dirname(filePath);
    const parentFolder = path.dirname(folder);

    // Use parent folder as the processing key
    const key = parentFolder + batchId;
    if (this.processedFolders.has(key)) {
      return [];
    }
    this.processedFolders.add(key);

    return this.parseAllSubFolders(parentFolder, batchId);
  }

  private async parseAllSubFolders(rootFolder: string, batchId: string): Promise<FactDspRow[]> {
    const allRows: FactDspRow[] = [];

    // Only parse weekly-topd — the only Spotify source with ISRC + track-level data.
    // Skipped folders:
    //   - weekly-prrt:  Market share aggregates (no ISRC, no track info)
    //   - monthly-msen: Playlist stream share (no ISRC, no track info)
    //   - weekly-chrt:  Chart rankings (XLSX, no ISRC — only track_name/artist)
    const topdFolder = path.join(rootFolder, 'weekly-topd');
    if (fs.existsSync(topdFolder)) {
      const files = fs.readdirSync(topdFolder).filter((f) => f.endsWith('.csv'));
      for (const file of files) {
        const rows = await this.parseTopd(path.join(topdFolder, file), batchId);
        allRows.push(...rows);
      }
    }

    this.logger.log(`Spotify: ${allRows.length} total rows parsed from weekly-topd`);
    return allRows;
  }

  /**
   * weekly-topd: Top tracks with demographics (CSV, quoted)
   * Columns: week_start_date, week_end_date, merlin_licensor, country, rank,
   *          isrc, track_name, artists, age_bucket, gender, streams30s
   */
  private async parseTopd(filePath: string, batchId: string): Promise<FactDspRow[]> {
    const rows: FactDspRow[] = [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return rows;

    const headers = this.parseLine(lines[0], ',');

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseLine(lines[i], ',');
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h.trim()] = (values[idx] || '').trim();
      });

      const isrc = record['isrc'];
      if (!isrc) continue;

      const row = this.createBaseRow(batchId);

      // Date: prefer data field, fallback to filename (YYYY_WW → Monday of ISO week)
      const weekStart = record['week_start_date'];
      if (weekStart && weekStart.trim() !== '') {
        row.reporting_period = this.normalizeDate(weekStart);
      } else {
        row.reporting_period = this.extractWeekDateFromFilename(filePath);
      }

      row.isrc = isrc;
      row.territory_code = this.normalizeCountryCode(record['country']);
      row.track_title = record['track_name'] || '';
      row.artist_name = record['artists'] || '';
      row.licensor = record['merlin_licensor'] || '';
      row.quantity_total = this.safeInt(record['streams30s']);
      row.usage_type = 'stream';

      row.metadata = {
        report_type: 'topd',
        ...(record['rank'] ? { rank: record['rank'] } : {}),
        ...(record['age_bucket'] ? { age_bucket: record['age_bucket'] } : {}),
        ...(record['gender'] ? { gender: record['gender'] } : {}),
        ...(record['week_end_date'] ? { week_end_date: record['week_end_date'] } : {}),
      };

      rows.push(row);
    }

    return rows;
  }

  /**
   * weekly-prrt: Pro-rata market share by country (TSV)
   * Columns: merlin_member, country, product, description, rightsholders_streams,
   *          total_streams, label_market_share
   * Note: No ISRC — these are aggregate market share figures.
   */
  private async parsePrrt(filePath: string, batchId: string): Promise<FactDspRow[]> {
    const rows: FactDspRow[] = [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return rows;

    const headers = this.parseLine(lines[0], '\t');

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseLine(lines[i], '\t');
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h.trim()] = (values[idx] || '').trim();
      });

      const row = this.createBaseRow(batchId);
      row.reporting_period = this.extractWeekDateFromFilename(filePath);
      row.isrc = ''; // No ISRC in prrt
      row.territory_code = this.normalizeCountryCode(record['country']);
      row.licensor = record['merlin_member'] || '';
      row.quantity_total = this.safeInt(record['rightsholders_streams']);
      row.usage_type = 'market_share';
      row.monetisation_type = record['product'] || '';

      row.metadata = {
        report_type: 'prrt',
        description: record['description'] || '',
        total_streams: record['total_streams'] || '',
        label_market_share: record['label_market_share'] || '',
      };

      rows.push(row);
    }

    return rows;
  }

  /**
   * monthly-msen: Monthly playlist stream share (CSV)
   * Columns: playlist_uri, playlist_name, merlin_licensor, streamshare
   * Note: No ISRC — playlist-level aggregate.
   */
  private async parseMsen(filePath: string, batchId: string): Promise<FactDspRow[]> {
    const rows: FactDspRow[] = [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return rows;

    const headers = this.parseLine(lines[0], ',');

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseLine(lines[i], ',');
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h.trim()] = (values[idx] || '').trim();
      });

      const row = this.createBaseRow(batchId);
      row.reporting_period = this.extractMonthDateFromFilename(filePath);
      row.isrc = ''; // No ISRC
      row.licensor = record['merlin_licensor'] || '';
      row.usage_type = 'playlist_share';

      row.metadata = {
        report_type: 'msen',
        playlist_uri: record['playlist_uri'] || '',
        playlist_name: record['playlist_name'] || '',
        streamshare: record['streamshare'] || '',
      };

      rows.push(row);
    }

    return rows;
  }

  /**
   * Extract date from Spotify filename pattern: _YYYY_WW (year + ISO week number)
   * e.g. _2022_19.csv → Monday of ISO week 19 in 2022 = 2022-05-09
   */
  private extractWeekDateFromFilename(filePath: string): string {
    const basename = path.basename(filePath);
    const match = basename.match(/_(\d{4})_(\d{1,2})\./);
    if (match) {
      const year = parseInt(match[1]);
      const week = parseInt(match[2]);
      // ISO week 1 starts on the Monday of the week containing Jan 4th
      const jan4 = new Date(year, 0, 4);
      const dayOfWeek = jan4.getDay() || 7; // Mon=1, Sun=7
      const monday = new Date(jan4);
      monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
      const y = monday.getFullYear();
      const m = String(monday.getMonth() + 1).padStart(2, '0');
      const d = String(monday.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return this.extractDateFromFilename(filePath);
  }

  /**
   * Extract date from monthly filename: _YYYY_MM → first day of month
   * e.g. _2022_05.csv → 2022-05-01
   */
  private extractMonthDateFromFilename(filePath: string): string {
    const basename = path.basename(filePath);
    const match = basename.match(/_(\d{4})_(\d{2})\./);
    if (match) {
      return `${match[1]}-${match[2]}-01`;
    }
    return this.extractDateFromFilename(filePath);
  }

  // Not used — folder-level processing
  protected parseRow(): FactDspRow | null {
    return null;
  }
}
