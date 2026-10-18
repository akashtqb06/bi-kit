export type CsvColumnType = 'integer' | 'real' | 'date' | 'text';

export function sanitizeColumnNames(names: string[]): string[] {
    const seen = new Set<string>();
    return names.map((name, index) => {
        const base =
            name
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '') || `column_${index + 1}`;
        let sanitized = base;
        let suffix = 2;
        while (seen.has(sanitized)) {
            sanitized = `${base}_${suffix}`;
            suffix += 1;
        }
        seen.add(sanitized);
        return sanitized;
    });
}

export function sanitizeTableName(fileName: string): string {
    const stem =
        fileName
            .replace(/\\/g, '/')
            .split('/')
            .pop()
            ?.replace(/\.csv$/i, '') ?? '';
    return sanitizeColumnNames([stem])[0] ?? 'csv_data';
}

export function inferCsvColumnType(values: string[]): CsvColumnType {
    const samples = values.slice(0, 1000).filter((value) => value.trim() !== '');
    if (samples.length === 0) return 'text';

    if (samples.every((value) => /^-?\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value)))) {
        return 'integer';
    }
    if (
        samples.every((value) => {
            const number = Number(value.trim());
            return value.trim() !== '' && Number.isFinite(number);
        })
    ) {
        return 'real';
    }
    if (
        samples.every(
            (value) =>
                /^\d{4}-\d{2}-\d{2}(?:[Tt ][0-9:.+-]+Z?)?$/.test(value.trim()) &&
                !Number.isNaN(Date.parse(value.trim()))
        )
    ) {
        return 'date';
    }
    return 'text';
}
