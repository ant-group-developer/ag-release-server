import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionController } from './action.controller';
import { Action } from './entities/action.entity';
import { ActionQueryService } from './services/action.query.service';
import { ActionService } from './services/action.service';

@Module({
	imports: [TypeOrmModule.forFeature([Action])],
	controllers: [ActionController],
	providers: [ActionService, ActionQueryService],
})
export class ActionModule {}
