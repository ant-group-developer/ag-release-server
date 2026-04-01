import { Controller, Get, Header } from '@nestjs/common';
import { PublicRoute } from '../../auth/decorators/auth.decorator';
import {
	albumExample,
	ern382Example,
	manifestEcho11Example,
	manifestExample,
	singleExample,
} from '../ern-example.data';
import { ErnVersion } from '../interfaces/ern-input.interface';
import { ErnService } from '../services/ern.service';

@PublicRoute()
@Controller('ern')
export class ErnController {
	constructor(private readonly ernService: ErnService) {}

	// --- ERN 4.3 ---

	@Get('example/43/single')
	@Header('Content-Type', 'application/xml')
	exampleSingle43() {
		return this.ernService.generate({ ...singleExample, version: ErnVersion.ERN_43 });
	}

	@Get('example/43/album')
	@Header('Content-Type', 'application/xml')
	exampleAlbum43() {
		return this.ernService.generate({ ...albumExample, version: ErnVersion.ERN_43 });
	}

	// --- ERN 3.8.2 ---

	@Get('example/382/single')
	@Header('Content-Type', 'application/xml')
	exampleSingle382() {
		return this.ernService.generate({ ...singleExample, version: ErnVersion.ERN_382 });
	}

	@Get('example/382/album')
	@Header('Content-Type', 'application/xml')
	exampleAlbum382() {
		return this.ernService.generate({ ...albumExample, version: ErnVersion.ERN_382 });
	}

	@Get('example/382/full')
	@Header('Content-Type', 'application/xml')
	exampleFull382() {
		return this.ernService.generate(ern382Example);
	}

	// --- Manifest (BatchComplete) ---

	@Get('example/manifest')
	@Header('Content-Type', 'application/xml')
	exampleManifest() {
		return this.ernService.generateManifest(manifestExample);
	}

	@Get('example/manifest/echo11')
	@Header('Content-Type', 'application/xml')
	exampleManifestEcho11() {
		return this.ernService.generateManifest(manifestEcho11Example);
	}
}
