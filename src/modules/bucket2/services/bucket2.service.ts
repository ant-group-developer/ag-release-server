import { Injectable } from '@nestjs/common';
import { BucketFileService2 } from './private/bucket2-file.service';

@Injectable()
export class BucketService2 {
	constructor(private readonly bucketFileService2: BucketFileService2) {}

	// create
}
