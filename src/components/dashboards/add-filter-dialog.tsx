'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { nanoid } from 'nanoid';
import { CalendarIcon, ListFilterIcon } from 'lucide-react';
import type { DashboardFilter } from '@src/lib/schemas';

const filterFormSchema = z.object({
    name: z.string().trim().min(1, 'Filter label is required').max(255, 'Filter label must be 255 characters or fewer'),
    column: z.string().min(1, 'Select a target column'),
    type: z.enum(['date_range', 'select']),
});

type FilterFormValues = z.infer<typeof filterFormSchema>;

export interface AddFilterDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    availableColumns: string[];
    onAddFilter: (filter: DashboardFilter) => void;
}

export function AddFilterDialog({ open, onOpenChange, availableColumns, onAddFilter }: AddFilterDialogProps) {
    const form = useForm<FilterFormValues>({
        resolver: zodResolver(filterFormSchema),
        defaultValues: { name: '', column: '', type: 'select' },
    });

    const handleSubmit = (values: FilterFormValues) => {
        onAddFilter({
            id: `filter_${nanoid(6)}`,
            name: values.name,
            column: values.column,
            type: values.type,
        });

        form.reset({ name: '', column: '', type: 'select' });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">Add Dashboard Filter</DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Configure a global filter. Charts referencing this column will be filtered at runtime.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-2">
                        {/* Filter Name */}
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem className="space-y-1.5">
                                    <FormLabel className="text-xs">Filter Label</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="e.g. Order Date, Region, Status"
                                            className="h-8 text-xs"
                                            autoFocus
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                </FormItem>
                            )}
                        />

                        {/* Target Column */}
                        <FormField
                            control={form.control}
                            name="column"
                            render={({ field }) => (
                                <FormItem className="space-y-1.5">
                                    <FormLabel className="text-xs">Target Column</FormLabel>
                                    <Select
                                        value={field.value}
                                        items={availableColumns.map((col) => ({ value: col, label: col }))}
                                        onValueChange={(value) => {
                                            if (!value) return;
                                            field.onChange(value);
                                            if (!form.getValues('name').trim()) {
                                                const label = value
                                                    .replace(/_/g, ' ')
                                                    .replace(/\b\w/g, (character) => character.toUpperCase());
                                                form.setValue('name', label, { shouldValidate: true });
                                            }
                                            if (/date|time|created/i.test(value)) {
                                                form.setValue('type', 'date_range');
                                            }
                                        }}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="h-8 text-xs w-full">
                                                <SelectValue placeholder="Select column from charts..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {availableColumns.map((col) => (
                                                <SelectItem key={col} value={col} className="text-xs">
                                                    {col}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[10px] text-muted-foreground">
                                        When any chart query contains this column, the filter will apply.
                                    </p>
                                    {availableColumns.length === 0 && (
                                        <p className="text-xs text-muted-foreground">No chart columns available.</p>
                                    )}
                                    <FormMessage className="text-xs" />
                                </FormItem>
                            )}
                        />

                        {/* Filter Type */}
                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem className="space-y-1.5">
                                    <FormLabel className="text-xs">Filter Control Type</FormLabel>
                                    <FormControl>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => field.onChange('select')}
                                                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all text-left cursor-pointer ${
                                                    field.value === 'select'
                                                        ? 'border-primary bg-primary/10 text-primary shadow-xs'
                                                        : 'border-border text-muted-foreground hover:bg-muted/50'
                                                }`}
                                            >
                                                <ListFilterIcon className="size-4 shrink-0" />
                                                <div>
                                                    <p className="font-semibold leading-none">Select</p>
                                                    <p className="text-[10px] font-normal opacity-80 mt-1">
                                                        Dropdown of values
                                                    </p>
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => field.onChange('date_range')}
                                                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all text-left cursor-pointer ${
                                                    field.value === 'date_range'
                                                        ? 'border-primary bg-primary/10 text-primary shadow-xs'
                                                        : 'border-border text-muted-foreground hover:bg-muted/50'
                                                }`}
                                            >
                                                <CalendarIcon className="size-4 shrink-0" />
                                                <div>
                                                    <p className="font-semibold leading-none">Date Range</p>
                                                    <p className="text-[10px] font-normal opacity-80 mt-1">
                                                        Calendar picker
                                                    </p>
                                                </div>
                                            </button>
                                        </div>
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenChange(false)}
                                className="text-xs h-8"
                            >
                                Cancel
                            </Button>
                            <Button type="submit" size="sm" className="text-xs h-8">
                                Add Filter
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
