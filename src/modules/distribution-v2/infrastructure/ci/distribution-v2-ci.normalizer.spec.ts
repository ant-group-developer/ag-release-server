import {
	normalizeCiImportResponses,
	normalizeCiQaResponses,
} from './distribution-v2-ci.normalizer';

describe('distribution-v2 CI normalizers', () => {
	it('normalizes import status and file warnings without relying on description length', () => {
		const result = normalizeCiImportResponses(
			[
				{
					external_identifier: 'group-1',
					status: 'problem',
					internal_batch_identifier: 'internal-1',
					import_file: [
						{
							package_id: '0085008065001',
							import_status: 'problem',
							description: [
								{ warnings: ['ISRC update is not allowed'] },
								{ errors: ['metadata rejected'] },
							],
						},
					],
				},
			],
			{
				upc: '0085008065001',
				importExternalIdentifier: 'group-1',
			},
		);

		expect(result.status).toBe('PROBLEM');
		expect(result.internalBatchId).toBe('internal-1');
		expect(result.warnings).toEqual(['ISRC update is not allowed']);
		expect(result.errors).toEqual(['metadata rejected']);
	});

	it('collects blockers across every QA page and ignores closed blockers', () => {
		const result = normalizeCiQaResponses(
			[
				{
					_embedded: [
						{
							id: 1,
							closed_date: '2026-09-17T00:00:00.000Z',
							qa_flag_type: { is_blocker: true },
						},
					],
				},
				{
					_embedded: [
						{
							id: 2,
							closed_date: null,
							qa_flag_type: { is_blocker: true },
						},
						{
							id: 3,
							closed_date: null,
							qa_flag_type: { is_blocker: false },
						},
					],
				},
			],
			{ releaseFormatId: 'release-format-1' },
		);

		expect(result.flags).toHaveLength(3);
		expect(result.blockers.map((flag) => flag.id)).toEqual([2]);
		expect(result.pageCount).toBe(2);
	});
});
