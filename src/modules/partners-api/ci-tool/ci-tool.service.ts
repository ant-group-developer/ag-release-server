import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';

@Injectable()
export class CiToolService {
    constructor(private readonly httpService: HttpService) { }

    async sendFileExportToCi(file: {
        buffer: Buffer;
        originalname: string;
        mimetype: string;
    }) {
        const formData = new FormData();

        formData.append('file', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
        });

        const { data } = await firstValueFrom(
            this.httpService.post(
                `${process.env.CI_TOOL_URL}/api/export/trigger`,
                formData,
                {
                    headers: {
                        'x-api-key': process.env.CI_TOOL_API_KEY,
                        ...formData.getHeaders(),
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                },
            ),
        );

        return data;
    }
}