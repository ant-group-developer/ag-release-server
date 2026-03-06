// src/modules/file-node/file-node.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileNode } from './entities/file-node.entity';
import { FileNodeController } from './file-node.controller';
import { FileNodeQueryService } from './services/file-node.query.service';
import { FileNodeService } from './services/file-node.service';

@Module({
	imports: [TypeOrmModule.forFeature([FileNode])],
	controllers: [FileNodeController],
	providers: [FileNodeService, FileNodeQueryService],
	exports: [FileNodeService],
})
export class FileNodeModule {}
