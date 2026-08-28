import { FtpSourceCategory } from '../dto/ftp-parser-config.dto';
import { expandParserCatalogCodes } from './ftp-parser-config.service';

describe('expandParserCatalogCodes', () => {
	it('resolves the Vevo parser dspId to the trends catalog key', () => {
		expect(expandParserCatalogCodes('vevo', FtpSourceCategory.TRENDS)).toEqual(
			['vevo', 'ftp.trends.vevo', 'ftp.trends.vvo'],
		);
	});

	it('keeps the canonical catalog code', () => {
		expect(
			expandParserCatalogCodes('ftp.trends.vvo', FtpSourceCategory.TRENDS),
		).toEqual(['ftp.trends.vvo']);
	});
});
