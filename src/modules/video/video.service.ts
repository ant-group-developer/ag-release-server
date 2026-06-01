import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Video } from './entities/video.entity';
import { CreateVideoDto, UpdateVideoDto } from './dto/video.dto';


@Injectable()
export class VideoService {
    constructor(
        @InjectRepository(Video)
        private readonly videoRepo: Repository<Video>,
    ) { }

    async create(dto: CreateVideoDto) {
        const video = this.videoRepo.create(dto);
        return this.videoRepo.save(video);
    }

    async findAll() {
        return this.videoRepo.find({
            relations: {
                release: true,
                videoFile: true,
            },
            order: {
                createdAt: 'DESC',
            },
        });
    }

    async findOne(id: string) {
        const video = await this.videoRepo.findOne({
            where: { id },
            relations: {
                release: true,
                videoFile: true,
            },
        });

        if (!video) {
            throw new NotFoundException('Video not found');
        }

        return video;
    }

    async findByReleaseId(releaseId: string) {
        const video = await this.videoRepo.findOne({
            where: { releaseId },
            relations: {
                release: true,
                videoFile: true,
            },
        });

        if (!video) {
            throw new NotFoundException('Video not found');
        }

        return video;
    }

    async update(id: string, dto: UpdateVideoDto) {
        const video = await this.findOne(id);

        Object.assign(video, dto);

        return this.videoRepo.save(video);
    }

    async remove(id: string) {
        const video = await this.findOne(id);
        await this.videoRepo.remove(video);

        return {
            success: true,
        };
    }
}