import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { ArtistDataInit } from '../services/artist.data.service';

@ApiTags('Artists')
@Controller('artists')
export class ArtistDataController {
	constructor(private readonly artistDataInit: ArtistDataInit) {}

	@Post('export-data/ada')
	async exportFromAda(
		@Body() body: { cookie: string; authorization: string },
	) {
		const dir = await this.artistDataInit.exportAdaArtists(
			body.cookie,
			body.authorization,
		);

		return new ResponseSuccess({
			message: 'CSV exported in multiple files (10k each)',
			data: dir,
		});
	}

	@Post('import-data/ada')
	async importFromAda() {
		const result = await this.artistDataInit.importAdaArtists();
		return new ResponseSuccess({
			message: `Imported ${result.totalRows} rows from ${result.totalFiles} files`,
			data: result.sample,
		});
	}

	@Post('import-data/excel')
	importArtistsFromFile(@Body() body: { filePath: string }) {
		return this.artistDataInit.importArtistsFromFile(body.filePath);
	}

	@Get('count-mb')
	async countArtistsFromMusicBrainz() {
		const result = await this.artistDataInit.countArtistsFromMb();

		return new ResponseSuccess({
			message: 'Count completed',
			data: result,
		});
	}
}
