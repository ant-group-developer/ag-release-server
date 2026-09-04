import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetOwnershipPeriod } from './entities/asset-ownership-period.entity';
import { AssetOwnershipTransferEvent } from './entities/asset-ownership-transfer-event.entity';
import { AssetOwnershipService } from './services/asset-ownership.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			AssetOwnershipPeriod,
			AssetOwnershipTransferEvent,
		]),
	],
	providers: [AssetOwnershipService],
	exports: [AssetOwnershipService],
})
export class AssetOwnershipModule {}
