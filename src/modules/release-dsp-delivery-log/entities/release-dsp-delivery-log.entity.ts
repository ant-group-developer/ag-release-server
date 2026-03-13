import { Entity, Column, Index } from 'typeorm';
import { BaseUUIDEntity } from '../../../common/entities/base.entity';
import { ReleaseDspDeliveryLogLevel } from '../enum/release-dsp-delivery-log.enum';

@Entity('release_dsp_delivery_logs')
export class ReleaseDspDeliveryLog extends BaseUUIDEntity {
    // ID của release liên quan
    @Index()
    @Column({
        type: 'uuid',
        comment: 'ID của release liên quan tới log giao DSP',
    })
    releaseId: string;

    // ID của DSP (Spotify, Apple Music, TikTok...)
    @Index()
    @Column({
        comment: 'ID của DSP nơi release được phân phối',
    })
    dspId: string;

    // Tiêu đề log
    @Column({
        length: 255,
        comment: 'Tiêu đề ngắn mô tả lỗi hoặc sự kiện',
    })
    title: string;

    // Nội dung chi tiết lỗi
    @Column({
        type: 'text',
        nullable: true,
        comment: 'Nội dung chi tiết của lỗi hoặc thông tin log',
    })
    content: string;

    // Mức độ log
    @Column({
        length: 50,
        enum: ReleaseDspDeliveryLogLevel,
        default: 'ERROR',
        comment: 'Mức độ log: ERROR | WARNING | INFO',
    })
    level: ReleaseDspDeliveryLogLevel;

    // Dữ liệu bổ sung
    @Column({
        type: 'json',
        nullable: true,
        comment:
            'Dữ liệu bổ sung dạng JSON: request payload, response từ DSP, stack trace...',
    })
    metadata?: Record<string, any>;

}