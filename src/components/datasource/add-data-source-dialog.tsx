'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileUpIcon, Loader2Icon, PlugZapIcon } from 'lucide-react';
import { inferCsvColumnType, sanitizeColumnNames, type CsvColumnType } from '@src/lib/data-sources/csv-utils';

// ---------------------------------------------------------------------------
// Form schema
// ---------------------------------------------------------------------------

const formSchema = z
    .object({
        name: z.string().min(1, 'Name is required').max(255),
        type: z.enum(['sqlite', 'csv']),
        path: z.string().optional(),
    })
    .superRefine((values, context) => {
        if (values.type === 'sqlite' && !values.path?.trim()) {
            context.addIssue({ code: 'custom', path: ['path'], message: 'File path is required' });
        }
    });

type FormValues = z.infer<typeof formSchema>;

interface CsvPreview {
    columns: { name: string; type: CsvColumnType }[];
    rows: string[][];
}

interface DataSourceTarget {
    id: string;
    name: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AddDataSourceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    sourceToReplace?: DataSourceTarget | null;
}

export function AddDataSourceDialog({
    open,
    onOpenChange,
    onSuccess,
    sourceToReplace = null,
}: AddDataSourceDialogProps) {
    const [testing, setTesting] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<CsvPreview | null>(null);
    const [previewError, setPreviewError] = useState('');
    const [dragging, setDragging] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { name: '', type: sourceToReplace ? 'csv' : 'sqlite', path: '' },
    });

    const watchType = useWatch({ control: form.control, name: 'type' });
    const submitting = form.formState.isSubmitting;

    const handleClose = () => {
        form.reset();
        setFile(null);
        setPreview(null);
        setPreviewError('');
        onOpenChange(false);
    };

    const selectFile = async (selectedFile: File | undefined) => {
        if (!selectedFile) return;
        setPreview(null);
        setPreviewError('');
        if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
            setFile(null);
            setPreviewError('Choose a file with a .csv extension.');
            return;
        }
        if (selectedFile.type !== 'text/csv' && selectedFile.type !== 'text/plain') {
            setFile(null);
            setPreviewError('The file must be a text/csv or text/plain file.');
            return;
        }
        if (selectedFile.size === 0) {
            setFile(null);
            setPreviewError('The selected CSV file is empty.');
            return;
        }
        if (selectedFile.size > 20 * 1024 * 1024) {
            setFile(null);
            setPreviewError('The selected CSV file exceeds the 20 MB limit.');
            return;
        }

        setFile(selectedFile);
        if (!form.getValues('name').trim()) {
            form.setValue('name', selectedFile.name.replace(/\.csv$/i, ''), { shouldValidate: true });
        }
        try {
            const parsed = Papa.parse<Record<string, string>>(await selectedFile.text(), {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: false,
            });
            const parseError = parsed.errors.find((error) => error.code !== 'UndetectableDelimiter');
            if (parseError) {
                setPreviewError(`Could not parse CSV: ${parseError.message}`);
                return;
            }
            const fields = parsed.meta.fields ?? [];
            if (fields.length === 0) {
                setPreviewError('The CSV must include a header row.');
                return;
            }
            const rows = parsed.data;
            setPreview({
                columns: sanitizeColumnNames(fields).map((name, index) => ({
                    name,
                    type: inferCsvColumnType(rows.slice(0, 1000).map((row) => row[fields[index] ?? ''] ?? '')),
                })),
                rows: rows.slice(0, 5).map((row) => fields.map((field) => row[field] ?? '')),
            });
        } catch {
            setPreviewError('Could not read the selected CSV file.');
        }
    };

    const handleTest = async () => {
        if (watchType !== 'sqlite') return;
        const valid = await form.trigger(['type', 'path']);
        if (!valid) return;

        const { path } = form.getValues();
        setTesting(true);
        try {
            const res = await fetch('/api/data-sources/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'sqlite', config: { path } }),
            });
            const json = (await res.json()) as { data?: { ok: boolean; tableCount?: number }; error?: string };
            if (!res.ok || !json.data?.ok) {
                toast.error('Connection failed', {
                    description: json.error ?? 'Could not connect to the data source.',
                });
            } else {
                const detail =
                    json.data.tableCount !== undefined
                        ? `Found ${json.data.tableCount} table${json.data.tableCount !== 1 ? 's' : ''}.`
                        : 'File is readable.';
                toast.success('Connection successful', { description: detail });
            }
        } catch {
            toast.error('Connection failed', { description: 'An unexpected error occurred.' });
        } finally {
            setTesting(false);
        }
    };

    const onSubmit = async (values: FormValues) => {
        try {
            let res: Response;
            if (values.type === 'csv') {
                if (!file || !preview || previewError) {
                    toast.error('Choose a valid CSV file', { description: previewError || 'A CSV file is required.' });
                    return;
                }
                const formData = new FormData();
                formData.append('file', file);
                formData.append('name', values.name);
                res = await fetch(
                    sourceToReplace ? `/api/data-sources/${sourceToReplace.id}/upload` : '/api/data-sources/upload',
                    { method: sourceToReplace ? 'PUT' : 'POST', body: formData }
                );
            } else {
                res = await fetch('/api/data-sources', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: values.name, type: values.type, config: { path: values.path } }),
                });
            }
            const json = (await res.json()) as { data?: { rowCount?: number }; error?: string };
            if (!res.ok) {
                toast.error(sourceToReplace ? 'Failed to replace CSV file' : 'Failed to add data source', {
                    description: json.error,
                });
                return;
            }
            if (values.type === 'csv') {
                const rowCount = json.data?.rowCount ?? 0;
                toast.success(sourceToReplace ? 'CSV file replaced' : 'Data source added', {
                    description: `${rowCount.toLocaleString()} rows imported.`,
                });
            } else {
                toast.success('Data source added');
            }
            handleClose();
            onSuccess();
        } catch {
            toast.error(sourceToReplace ? 'Failed to replace CSV file' : 'Failed to add data source', {
                description: 'An unexpected error occurred.',
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{sourceToReplace ? 'Replace CSV File' : 'Add Data Source'}</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {/* Name */}
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="My Database" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Type */}
                        {!sourceToReplace && (
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Type</FormLabel>
                                        <FormControl>
                                            <Select
                                                value={field.value}
                                                items={[
                                                    { value: 'sqlite', label: 'SQLite' },
                                                    { value: 'csv', label: 'CSV' },
                                                ]}
                                                onValueChange={(val) => {
                                                    field.onChange(val);
                                                    if (val === 'sqlite') {
                                                        setFile(null);
                                                        setPreview(null);
                                                        setPreviewError('');
                                                    }
                                                }}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="sqlite">SQLite</SelectItem>
                                                    <SelectItem value="csv">CSV</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {watchType === 'sqlite' ? (
                            <FormField
                                control={form.control}
                                name="path"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Database File Path</FormLabel>
                                        <FormControl>
                                            <Input placeholder="/path/to/database.db" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        ) : (
                            <div className="space-y-3">
                                <div
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        setDragging(true);
                                    }}
                                    onDragLeave={() => setDragging(false)}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        setDragging(false);
                                        void selectFile(event.dataTransfer.files[0]);
                                    }}
                                >
                                    <label htmlFor="csv-upload" className="block cursor-pointer">
                                        <Card
                                            className={`rounded-lg border-2 border-dashed transition-colors ${dragging ? 'border-primary bg-muted/50' : 'border-border'}`}
                                        >
                                            <CardContent className="flex min-h-28 flex-col items-center justify-center gap-2 text-center">
                                                <FileUpIcon className="size-6 text-muted-foreground" />
                                                <span className="text-sm font-medium">
                                                    Drop a CSV file here or browse
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    CSV or plain text, up to 20 MB
                                                </span>
                                            </CardContent>
                                        </Card>
                                        <Input
                                            id="csv-upload"
                                            type="file"
                                            accept=".csv,text/csv,text/plain"
                                            className="sr-only"
                                            onChange={(event) => void selectFile(event.target.files?.[0])}
                                        />
                                    </label>
                                </div>
                                {previewError && (
                                    <p role="alert" className="text-sm text-destructive">
                                        {previewError}
                                    </p>
                                )}
                                {file && (
                                    <p className="text-xs text-muted-foreground">
                                        {file.name} · {(file.size / 1024).toFixed(1)} KB
                                    </p>
                                )}
                                {preview && (
                                    <div className="max-h-56 overflow-auto rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    {preview.columns.map((column) => (
                                                        <TableHead key={column.name} className="whitespace-nowrap">
                                                            <span className="mr-2">{column.name}</span>
                                                            <Badge variant="outline" className="capitalize">
                                                                {column.type}
                                                            </Badge>
                                                        </TableHead>
                                                    ))}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {preview.rows.map((row, rowIndex) => (
                                                    <TableRow key={rowIndex}>
                                                        {row.map((value, columnIndex) => (
                                                            <TableCell key={columnIndex} className="max-w-48 truncate">
                                                                {value}
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        )}

                        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
                            {watchType === 'sqlite' && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleTest}
                                    disabled={testing || submitting}
                                >
                                    {testing ? (
                                        <Loader2Icon className="mr-2 size-4 animate-spin" />
                                    ) : (
                                        <PlugZapIcon className="mr-2 size-4" />
                                    )}
                                    Test Connection
                                </Button>
                            )}
                            <Button
                                type="submit"
                                disabled={
                                    testing ||
                                    submitting ||
                                    (watchType === 'csv' && (!file || !preview || !!previewError))
                                }
                            >
                                {submitting ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
                                {sourceToReplace ? 'Replace File' : 'Add Data Source'}
                            </Button>
                        </DialogFooter>
                        {submitting && watchType === 'csv' && <Progress value={null} aria-label="Uploading CSV" />}
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
