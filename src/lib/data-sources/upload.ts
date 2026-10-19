import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { newId } from '@src/lib/db/id';
import { UPLOADS_DIR } from '@src/lib/db/paths';

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const nameSchema = z.string().trim().min(1, 'Name is required.').max(255, 'Name must be 255 characters or fewer.');

export class CsvUploadError extends Error {
    constructor(
        message: string,
        readonly status: number = 400
    ) {
        super(message);
    }
}

export interface ValidatedCsvUpload {
    file: File;
    name: string;
    originalFileName: string;
}

export function validateCsvUpload(formData: FormData): ValidatedCsvUpload {
    const fileValue = formData.get('file');
    if (!(fileValue instanceof File)) {
        throw new CsvUploadError('A file is required in the "file" field.');
    }

    const originalFileName = sanitizeDisplayFileName(fileValue.name);
    if (!originalFileName.toLowerCase().endsWith('.csv')) {
        throw new CsvUploadError('The uploaded file must have a .csv extension.');
    }
    if (!new Set(['text/csv', 'text/plain']).has(fileValue.type.toLowerCase())) {
        throw new CsvUploadError('The uploaded file must have a text/csv or text/plain content type.');
    }
    if (fileValue.size === 0) {
        throw new CsvUploadError('The uploaded CSV file is empty.');
    }
    if (fileValue.size > MAX_UPLOAD_SIZE) {
        throw new CsvUploadError('The uploaded CSV file exceeds the 20 MB limit.', 413);
    }

    const nameValue = formData.get('name');
    const parsedName = nameSchema.safeParse(nameValue);
    if (!parsedName.success) {
        throw new CsvUploadError(parsedName.error.issues[0]?.message ?? 'A valid name is required.');
    }

    return { file: fileValue, name: parsedName.data, originalFileName };
}

export async function saveCsvUpload(file: File): Promise<{ path: string; text: string }> {
    const directory = UPLOADS_DIR;
    await fs.mkdir(directory, { recursive: true });
    const filePath = path.join(directory, `${newId()}.csv`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, bytes, { flag: 'wx' });
    return { path: filePath, text: bytes.toString('utf8') };
}

function sanitizeDisplayFileName(fileName: string): string {
    const basename = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
    const sanitized = basename
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 255);
    return sanitized || 'upload.csv';
}
