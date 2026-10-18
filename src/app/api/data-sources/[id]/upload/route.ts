import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { apiError, handleApiError } from '@src/app/api/utils';
import { getDataSource, replaceCsvDataSource } from '@src/lib/data-sources/service';
import { CsvImportError } from '@src/lib/data-sources/csv-import';
import { CsvUploadError, saveCsvUpload, validateCsvUpload } from '@src/lib/data-sources/upload';
import { requireUserApi } from '@src/lib/auth/dal';
import { assertCan } from '@src/lib/auth/policy';

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
    let uploadPath: string | undefined;
    try {
        const user = await requireUserApi();
        const { id } = await params;
        const source = getDataSource(id);
        assertCan(user, 'edit', { type: 'data_source', id, ownerId: source.ownerId });

        let formData: FormData;
        try {
            formData = await request.formData();
        } catch {
            return apiError('Expected a multipart/form-data request.', 400);
        }

        const upload = validateCsvUpload(formData);
        const savedFile = await saveCsvUpload(upload.file);
        uploadPath = savedFile.path;
        const data = replaceCsvDataSource(id, {
            name: upload.name,
            csvText: savedFile.text,
            originalFileName: upload.originalFileName,
        });
        return NextResponse.json({ data });
    } catch (error) {
        if (uploadPath) await fs.rm(uploadPath, { force: true });
        if (error instanceof CsvUploadError) return apiError(error.message, error.status);
        if (error instanceof CsvImportError) return apiError(error.message, 422);
        return handleApiError(error);
    }
}

export async function POST(request: Request, context: RouteParams): Promise<NextResponse> {
    return PUT(request, context);
}


