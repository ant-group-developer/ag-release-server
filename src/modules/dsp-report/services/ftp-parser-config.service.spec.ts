import { FtpSourceCategory } from '../dto/ftp-parser-config.dto';
import {
	expandParserCatalogCodes,
	mergeEffectiveFieldMappings,
} from './ftp-parser-config.service';

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

describe('mergeEffectiveFieldMappings', () => {
	const catalog = [
		{
			reportColumn: 'Album Title',
			parserColumn: 'Album Title',
			targetColumn: 'album_title',
			transform: 'trim',
		},
		{
			reportColumn: 'album_title',
			parserColumn: 'album_title',
			targetColumn: 'album_title',
			transform: 'trim',
		},
		{
			reportColumn: 'ISRC',
			parserColumn: 'ISRC',
			targetColumn: 'isrc',
			transform: 'trim',
		},
		{
			reportColumn: 'isrc',
			parserColumn: 'isrc',
			targetColumn: 'isrc',
			transform: 'trim',
		},
	];

	it('returns catalog aliases unchanged when there are no overrides', () => {
		expect(mergeEffectiveFieldMappings(catalog, [])).toEqual(catalog);
	});

	it('drops the catalog target group when an override redirects that reportColumn', () => {
		const result = mergeEffectiveFieldMappings(catalog, [
			{
				reportColumn: 'album_title',
				parserColumn: 'album_title',
				targetColumn: 'metadata.album_title',
				transform: 'trim',
			},
		]);

		expect(result).toEqual([
			{
				reportColumn: 'isrc',
				parserColumn: 'isrc',
				targetColumn: 'isrc',
				transform: 'trim',
			},
			{
				reportColumn: 'album_title',
				parserColumn: 'album_title',
				targetColumn: 'metadata.album_title',
				transform: 'trim',
			},
		]);
		expect(
			result.some((mapping) => mapping.targetColumn === 'album_title'),
		).toBe(false);
	});

	it('lets an override own its targetColumn even when catalog used a different source', () => {
		const result = mergeEffectiveFieldMappings(catalog, [
			{
				reportColumn: 'Release Title',
				parserColumn: 'Release Title',
				targetColumn: 'album_title',
				transform: 'trim',
			},
		]);

		expect(result.find((mapping) => mapping.targetColumn === 'album_title')).toEqual({
			reportColumn: 'Release Title',
			parserColumn: 'Release Title',
			targetColumn: 'album_title',
			transform: 'trim',
		});
	});

	it('appends skip overrides without collapsing them onto one target', () => {
		const result = mergeEffectiveFieldMappings(catalog, [
			{
				reportColumn: 'Adjustments',
				targetColumn: 'skip',
				transform: 'trim',
			},
			{
				reportColumn: 'Version',
				targetColumn: 'skip',
				transform: 'trim',
			},
		]);

		expect(result.filter((mapping) => mapping.targetColumn === 'skip')).toEqual([
			{
				reportColumn: 'Adjustments',
				targetColumn: 'skip',
				transform: 'trim',
			},
			{
				reportColumn: 'Version',
				targetColumn: 'skip',
				transform: 'trim',
			},
		]);
	});
});
