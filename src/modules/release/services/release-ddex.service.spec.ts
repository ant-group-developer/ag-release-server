import { DspCode } from 'src/modules/dsp/enum/dsp.enum';

import { resolveDdexArtistName } from './release-ddex.service';

describe('resolveDdexArtistName', () => {
	it('ưu tiên tên Spotify profile hợp lệ', () => {
		expect(
			resolveDdexArtistName({
				name: 'Artist gốc',
				artistProfiles: [
					{
						name: ' Spotify Artist ',
						dsp: { code: String(DspCode.SPOTIFY) },
					},
				],
			}),
		).toBe('Spotify Artist');
	});

	it.each(['', '   '])(
		'fallback sang tên artist khi tên Spotify là %p',
		(spotifyName) => {
			expect(
				resolveDdexArtistName({
					name: ' LyraNova ',
					artistProfiles: [
						{
							name: spotifyName,
							dsp: { code: String(DspCode.SPOTIFY) },
						},
					],
				}),
			).toBe('LyraNova');
		},
	);

	it('dùng tên artist khi không có Spotify profile', () => {
		expect(
			resolveDdexArtistName({
				name: 'LyraNova',
				artistProfiles: [],
			}),
		).toBe('LyraNova');
	});

	it('trả về chuỗi rỗng khi không có tên khả dụng', () => {
		expect(resolveDdexArtistName(null)).toBe('');
	});
});
