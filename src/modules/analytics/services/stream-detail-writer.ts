import * as ExcelJS from 'exceljs';
import * as fs from 'fs';

export interface DetailRowLike {
  [key: string]: unknown;
}

const DETAIL_COLUMNS = [
  { header: 'Date', key: 'date' },
  { header: 'Workspace', key: 'tenant' },
  { header: 'DspName', key: 'dspName' },
  { header: 'UPC', key: 'upc' },
  { header: 'ISRC', key: 'isrc' },
  { header: 'ReleaseName', key: 'releaseName' },
  { header: 'TrackName', key: 'trackName' },
  { header: 'ArtistName', key: 'artistName' },
  { header: 'LabelName', key: 'labelName' },
  { header: 'Territory', key: 'territory' },
  { header: 'TotalUsage', key: 'totalUsage' },
  { header: 'Revenue', key: 'revenueUsd' },
  { header: 'Currency', key: 'currency' },
];

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export interface IStreamDetailWriter {
  appendRow(row: DetailRowLike): void;
  flush(): Promise<void>;
}

// ─── CSV Streaming Writer ────────────────────────────────────

export class CsvStreamDetailWriter implements IStreamDetailWriter {
  private readonly stream: fs.WriteStream;
  private headerWritten = false;
  private flushPromise?: Promise<void>;

  constructor(filePath: string) {
    this.stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
  }

  appendRow(row: DetailRowLike): void {
    if (!this.headerWritten) {
      const headers = DETAIL_COLUMNS.map((c) => csvEscape(c.header));
      this.stream.write(`\uFEFF${headers.join(',')}\n`);
      this.headerWritten = true;
    }
    const values = DETAIL_COLUMNS.map((c) => csvEscape(row[c.key]));
    this.stream.write(`${values.join(',')}\n`);
  }

  async flush(): Promise<void> {
    if (!this.flushPromise) {
      this.flushPromise = new Promise<void>((resolve, reject) => {
        this.stream.end((err?: Error | null) =>
          err ? reject(err) : resolve(),
        );
      });
    }

    return this.flushPromise;
  }
}

// ─── XLSX Streaming Writer ───────────────────────────────────

export class XlsxStreamDetailWriter implements IStreamDetailWriter {
  private readonly workbook: ExcelJS.stream.xlsx.WorkbookWriter;
  private readonly sheet: ExcelJS.Worksheet;
  private flushPromise?: Promise<void>;

  constructor(filePath: string) {
    this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: filePath,
      useStyles: true,
      useSharedStrings: false,
    });
    this.sheet = this.workbook.addWorksheet('Detail');
    this.sheet.columns = DETAIL_COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: 18,
    }));
  }

  appendRow(row: DetailRowLike): void {
    this.sheet.addRow(row).commit();
  }

  async flush(): Promise<void> {
    if (!this.flushPromise) {
      this.flushPromise = this.flushOnce();
    }

    return this.flushPromise;
  }

  private async flushOnce(): Promise<void> {
    this.sheet.commit();
    await this.workbook.commit();
  }
}

// ─── Summary Accumulator ─────────────────────────────────────

export interface SummaryAccumulator {
  totalUsage: number;
  revenueSumUnits: bigint;
  revenueScale: number;
  uniqueIsrcs: Set<string>;
  uniqueReleases: Set<string>;
  uniqueLabels: Set<string>;
  uniqueDsps: Set<string>;
  uniqueTerritories: Set<string>;
  uniqueArtists: Set<string>;
  minStartDate: string;
  maxEndDate: string;
  rowCount: number;
  tenantName: string;
}

export function createEmptyAccumulator(): SummaryAccumulator {
  return {
    totalUsage: 0,
    revenueSumUnits: 0n,
    revenueScale: 0,
    uniqueIsrcs: new Set(),
    uniqueReleases: new Set(),
    uniqueLabels: new Set(),
    uniqueDsps: new Set(),
    uniqueTerritories: new Set(),
    uniqueArtists: new Set(),
    minStartDate: '',
    maxEndDate: '',
    rowCount: 0,
    tenantName: '',
  };
}

function normalizeDecimal(value: unknown): string {
  const text = String(value ?? '0').trim();
  if (!text) return '0';
  if (!text.includes('e') && !text.includes('E')) return text;

  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toFixed(18).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

function addRevenue(acc: SummaryAccumulator, value: unknown): void {
  const normalized = normalizeDecimal(value);
  const negative = normalized.startsWith('-');
  const unsigned = negative || normalized.startsWith('+')
    ? normalized.slice(1)
    : normalized;

  if (!/^\d*(\.\d*)?$/.test(unsigned)) return;

  const [whole = '0', frac = ''] = unsigned.split('.');
  const scale = frac.length;
  if (scale > acc.revenueScale) {
    acc.revenueSumUnits *= 10n ** BigInt(scale - acc.revenueScale);
    acc.revenueScale = scale;
  }

  const digits = `${whole || '0'}${frac.padEnd(acc.revenueScale, '0')}`;
  const units = BigInt(digits || '0');
  acc.revenueSumUnits += negative ? -units : units;
}

export function formatRevenueSum(acc: SummaryAccumulator): string {
  const negative = acc.revenueSumUnits < 0n;
  const abs = negative ? -acc.revenueSumUnits : acc.revenueSumUnits;
  if (acc.revenueScale === 0) return `${negative ? '-' : ''}${abs.toString()}`;

  const padded = abs.toString().padStart(acc.revenueScale + 1, '0');
  const whole = padded.slice(0, -acc.revenueScale) || '0';
  const frac = padded.slice(-acc.revenueScale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

export function updateAccumulator(
  acc: SummaryAccumulator,
  row: DetailRowLike,
): void {
  acc.rowCount++;
  acc.totalUsage += Number(row.totalUsage ?? 0);
  addRevenue(acc, row.revenueUsd);

  const isrc = String(row.isrc ?? '');
  if (isrc) acc.uniqueIsrcs.add(isrc);

  const rel = String(row.releaseName || row.upc || '');
  if (rel) acc.uniqueReleases.add(rel);

  const label = String(row.labelName ?? '');
  if (label) acc.uniqueLabels.add(label);

  const dsp = String(row.dspName ?? '');
  if (dsp) acc.uniqueDsps.add(dsp);

  const ter = String(row.territory ?? '');
  if (ter) acc.uniqueTerritories.add(ter);

  const artist = String(row.artistName ?? '');
  if (artist) acc.uniqueArtists.add(artist);

  const sd = String(row.startDate ?? '');
  if (sd && (!acc.minStartDate || sd < acc.minStartDate)) acc.minStartDate = sd;

  const ed = String(row.endDate ?? '');
  if (ed && (!acc.maxEndDate || ed > acc.maxEndDate)) acc.maxEndDate = ed;

  if (!acc.tenantName) acc.tenantName = String(row.tenant ?? '');
}

export interface GroupState {
  writer: IStreamDetailWriter;
  summary: SummaryAccumulator;
}

export function createStreamWriter(
  filePath: string,
  format: 'csv' | 'xlsx',
): IStreamDetailWriter {
  return format === 'csv'
    ? new CsvStreamDetailWriter(filePath)
    : new XlsxStreamDetailWriter(filePath);
}
