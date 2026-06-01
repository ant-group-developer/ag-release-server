import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
} from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { VideoService } from './video.service';
import { CreateVideoDto, UpdateVideoDto } from './dto/video.dto';


@Controller('videos')
export class VideoController {
    constructor(private readonly videoService: VideoService) { }

    @Post()
    async create(@Body() dto: CreateVideoDto) {
        const result = await this.videoService.create(dto);

        return new ResponseSuccess({
            data: result,
        });
    }

    @Get()
    async findAll() {
        const result = await this.videoService.findAll();

        return new ResponseSuccess({
            data: result,
        });
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        const result = await this.videoService.findOne(id);

        return new ResponseSuccess({
            data: result,
        });
    }

    @Get('release/:releaseId')
    async findByReleaseId(@Param('releaseId') releaseId: string) {
        const result = await this.videoService.findByReleaseId(releaseId);

        return new ResponseSuccess({
            data: result,
        });
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() dto: UpdateVideoDto,
    ) {
        const result = await this.videoService.update(id, dto);

        return new ResponseSuccess({
            data: result,
        });
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        const result = await this.videoService.remove(id);

        return new ResponseSuccess({
            data: result,
        });
    }
}