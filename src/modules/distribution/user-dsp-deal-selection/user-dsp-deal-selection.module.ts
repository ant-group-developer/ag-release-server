import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DspDealConfigEntity } from '../dsp-deal-config/entities/dsp-deal-config.entity';
import { UserDspDealSelectionEntity } from './entities/user-dsp-deal-selection.entity';
import { UserDspDealSelectionQueryService } from './services/user-dsp-deal-selection.query.service';
import { UserDspDealSelectionService } from './services/user-dsp-deal-selection.service';
import { UserDspDealSelectionController } from './user-dsp-deal-selection.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			UserDspDealSelectionEntity,
			DspDealConfigEntity,
		]),
	],
	controllers: [UserDspDealSelectionController],
	providers: [UserDspDealSelectionService, UserDspDealSelectionQueryService],
	exports: [UserDspDealSelectionService],
})
export class UserDspDealSelectionModule {}
