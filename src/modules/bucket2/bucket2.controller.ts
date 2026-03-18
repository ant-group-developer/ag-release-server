import { Controller } from '@nestjs/common';
import { BucketService2 } from './services/bucket2.service';

@Controller()
export class Bucket2Controller {
	constructor(private readonly bucketService2: BucketService2) {}
}
