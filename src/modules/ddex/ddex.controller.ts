import { Controller, Get, Header } from '@nestjs/common';
import { PublicRoute } from '../auth/decorators/auth.decorator';
import { DDEXService } from './ddex.service';
import { albumExample, singleExample } from './examples/ddex.example';

@PublicRoute()
@Controller('ddex')
export class DdexController {
	constructor(private readonly ddexService: DDEXService) {}

	@Get('example/single')
	@Header('Content-Type', 'application/xml')
	exampleSingle() {
		return this.ddexService.generate({
			version: '4.3',
			data: singleExample,
		});
	}

	@Get('example/album')
	@Header('Content-Type', 'application/xml')
	exampleAlbum() {
		return this.ddexService.generate({
			version: '4.3',
			data: albumExample,
		});
	}
}
