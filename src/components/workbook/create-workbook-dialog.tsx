'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2Icon } from 'lucide-react';

const schema = z.object({
    name: z.string().min(1, 'Name is required').max(255),
    description: z.string().max(1000),
});
type FormValues = z.infer<typeof schema>;

interface CreateWorkbookDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (id: string) => void;
}

export function CreateWorkbookDialog({ open, onOpenChange, onSuccess }: CreateWorkbookDialogProps) {
    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: '', description: '' },
    });

    const handleClose = () => {
        form.reset();
        onOpenChange(false);
    };

    const onSubmit = async (values: FormValues) => {
        try {
            const res = await fetch('/api/workbooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values),
            });
            const json = (await res.json()) as { data?: { id: string }; error?: string };
            if (!res.ok || !json.data) {
                toast.error('Failed to create workbook', { description: json.error });
                return;
            }
            toast.success(`"${values.name}" created`);
            handleClose();
            onSuccess(json.data.id);
        } catch {
            toast.error('Failed to create workbook');
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>New Workbook</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Sales Analysis" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Description <span className="text-muted-foreground">(optional)</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder="What is this workbook for?" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
                            <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
                                {form.formState.isSubmitting && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                                Create Workbook
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
