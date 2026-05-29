import { Module } from '@nestjs/common';
import { CiToolService } from './ci-tool.service';


@Module({
    // controllers: [CiExportToolController],
    providers: [CiToolService],
    exports: [CiToolService],
})
export class CiExportToolModule { }