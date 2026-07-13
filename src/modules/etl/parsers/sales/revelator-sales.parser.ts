import { FactSalesRow } from '../../interfaces';
import { BaseSalesParser } from './base-sales.parser';

export class RevelatorSalesParser extends BaseSalesParser {
	constructor() {
		super('revelator');
	}

	protected parseRow(
		r: Record<string, string>,
		batchId: string,
	): FactSalesRow | null {
		const isrc = r['ISRC']?.trim() ?? '';
		const upc = r['UPC']?.trim() ?? '';
		if (!isrc && !upc) return null;

		const row = this.createBaseRow(batchId);

		// "2025-08" → "2025-08-01" / "2025-08-31"
		const period = r['Statement Period']?.trim() ?? '';
		if (period) {
			row.reporting_period_start = `${period}-01`;
			const [y, m] = period.split('-').map(Number);
			const lastDay = new Date(y, m, 0).getDate();
			row.reporting_period_end = `${period}-${String(lastDay).padStart(2, '0')}`;
		}

		row.label_name = r['Label']?.trim() || 'N/A';
		row.artist_name = r['Artist']?.trim() || 'N/A';
		row.album_title = r['Release Title']?.trim() || 'N/A';
		row.track_title = r['Track Title']?.trim() || 'N/A';
		row.upc = upc || 'N/A';
		row.isrc = isrc || 'N/A';
		row.release_id = r['Release ID']?.trim() || 'N/A';
		row.service_name = r['Service']?.trim() || 'N/A';
		row.usage_type = r['Channel']?.trim() || 'N/A';
		row.territory_code = this.normalizeCountryCode(r['Territory']?.trim() ?? '');
		row.quantity = this.safeInt(r['Quantity'] ?? '0');
		row.revenue_usd = this.safeDecimal(r['Net Revenue in USD'] ?? '0');
		row.revenue_currency = 'USD';

		row.metadata = {
			transaction_month: r['Transaction Month']?.trim() ?? '',
			gross_revenue_usd: r['Gross Revenue in USD']?.trim() ?? '',
			mechanical_royalties_deducted:
				r['Mechanical Royalties Deducted']?.trim() ?? '',
			contract_rate_pct: r['Contract Rate %']?.trim() ?? '',
			your_share_pct: r['Your Share %']?.trim() ?? '',
			wht_deducted: r['WHT Deducted']?.trim() ?? '',
			amount_due_usd: r['Amount Due in USD']?.trim() ?? '',
			opening_balance_usd: r['Opening Balance in USD']?.trim() ?? '',
			closing_balance_usd: r['Closing Balance in USD']?.trim() ?? '',
			track_id: r['Track ID']?.trim() ?? '',
			account_id: r['Account ID']?.trim() ?? '',
			contract_id: r['Contract ID']?.trim() ?? '',
			payee_id: r['Payee ID']?.trim() ?? '',
			format: r['Format']?.trim() ?? '',
			release_catalog_id: r['Release Catalog ID']?.trim() ?? '',
			track_catalog_id: r['Track Catalog ID']?.trim() ?? '',
		};

		return row;
	}
}
