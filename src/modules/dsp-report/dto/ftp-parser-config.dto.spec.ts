import { globalValidationPipe } from 'src/common/config/validation.config';
import { UpdateFtpParserFieldMappingsDto } from './ftp-parser-config.dto';

describe('UpdateFtpParserFieldMappingsDto', () => {
	it('preserves parserColumn for a field-mapping override', async () => {
		const result = await globalValidationPipe.transform(
			{
				fieldMappings: [
					{
						reportColumn: 'rev_share',
						parserColumn: 'rev_share',
						targetColumn: 'revenue_usd',
						transform: 'trim',
					},
				],
			},
			{ type: 'body', metatype: UpdateFtpParserFieldMappingsDto },
		);

		expect(
			(result as UpdateFtpParserFieldMappingsDto).fieldMappings[0]
				.parserColumn,
		).toBe('rev_share');
	});
});
