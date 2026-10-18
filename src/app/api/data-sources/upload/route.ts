import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { handleApiError, apiError } from '@src/app/api/utils';
import { createCsvDataSource } from '@src/lib/data-sources/service';
import { CsvImportError } from '@src/lib/data-sources/csv-import';
import { CsvUploadError, saveCsvUpload, validateCsvUpload } from '@src/lib/data-sources/upload';

import { requireUserApi } from '@src/lib/auth/dal';

export async function POST(request: Request): Promise<NextResponse> {
    let uploadPath: string | undefined;
    try {
        const user = await requireUserApi();
        let formData: FormData;
        try {
            formData = await request.formData();
        } catch {
            return apiError('Expected a multipart/form-data request.', 400);
        }

        const upload = validateCsvUpload(formData);
        const savedFile = await saveCsvUpload(upload.file);
        uploadPath = savedFile.path;
        const data = createCsvDataSource({
            name: upload.name,
            csvText: savedFile.text,
            originalFileName: upload.originalFileName,
            ownerId: user.id,
        });
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        if (uploadPath) await fs.rm(uploadPath, { force: true });
        if (error instanceof CsvUploadError) return apiError(error.message, error.status);
        if (error instanceof CsvImportError) return apiError(error.message, 422);
        return handleApiError(error);
    }
}
