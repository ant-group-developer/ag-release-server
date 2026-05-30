import { Module } from '@nestjs/common';
import { CiToolService } from './ci-tool.service';
import { HttpModule } from '@nestjs/axios';
import { CiToolController } from './ci-tool.controller';
@Module({
    imports: [HttpModule],
    controllers: [CiToolController],
    providers: [CiToolService],
    exports: [CiToolService],
})
export class CiToolModule { }