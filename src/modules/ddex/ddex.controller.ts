import { Controller, Get, Header } from '@nestjs/common';
import { PublicRoute } from '../auth/decorators/auth.decorator';
import { ErnVersion } from '../ern/interfaces/ern-input.interface';
import { DDEXService } from './ddex.service';
import { albumExample, singleExample } from './examples/ddex.example';

@PublicRoute()
@Controller('ddex')
export class DdexController {
	constructor(private readonly ddexService: DDEXService) {}

	@Get('example/43/single')
	@Header('Content-Type', 'application/xml')
	exampleSingle43() {
		return this.ddexService.generate({
			version: ErnVersion.ERN_43,
			data: singleExample,
		});
	}

	@Get('example/43/album')
	@Header('Content-Type', 'application/xml')
	exampleAlbum43() {
		return this.ddexService.generate({
			version: ErnVersion.ERN_43,
			data: albumExample,
		});
	}

	@Get('example/382/single')
	@Header('Content-Type', 'application/xml')
	exampleSingle382() {
		return this.ddexService.generate({
			version: ErnVersion.ERN_382,
			data: singleExample,
		});
	}

	@Get('example/382/album')
	@Header('Content-Type', 'application/xml')
	exampleAlbum382() {
		return this.ddexService.generate({
			version: ErnVersion.ERN_382,
			data: albumExample,
		});
	}
}
