'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    DatabaseIcon,
    FileSpreadsheetIcon,
    LayersIcon,
    Loader2Icon,
    CheckCircle2Icon,
    AlertCircleIcon,
    AlertTriangleIcon,
    ChevronDownIcon,
    EyeIcon,
    EyeOffIcon,
    LinkIcon,
    UploadCloudIcon,
    ArrowRightIcon,
    ArrowLeftIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseConnectionUrl } from '@src/lib/connectors/url-parser';
import type { PublicConnectorDefinition } from '@src/lib/connectors/types';
import type { DataSourcePublic } from '@src/lib/data-sources/service';

interface AddDataSourceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    sourceToEdit?: DataSourcePublic | null;
    sourceToReplace?: { id: string; name: string } | null;
    existingNames?: string[];
}

interface TestResultState {
    ok: boolean;
    latencyMs?: number;
    serverVersion?: string;
    message?: string;
    tableCount?: number;
    warnings?: string[];
}

interface PreviewSheet {
    name: string;
    hidden?: boolean;
    rowCountEstimate: number;
    headers: string[];
    sampleRows: unknown[][];
}

interface PreviewResponseData {
    previewToken: string;
    type: 'csv' | 'excel' | 'sqlite';
    fileName: string;
    size: number;
    preview: {
        delimiter?: string;
        columns?: { name: string; type: string }[];
        sheets?: PreviewSheet[];
        tables?: { name: string; type: string }[];
        sampleRows?: unknown[][];
    };
}

const SECRET_SENTINEL = '••••••••';

function formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
}

function getConnectorIcon(iconName: string, category: string) {
    if (category === 'nosql' || iconName === 'Layers') {
        return <LayersIcon className="size-5 text-emerald-600 dark:text-emerald-400" />;
    }
    if (category === 'file' || iconName === 'FileSpreadsheet' || iconName === 'Sheet') {
        return <FileSpreadsheetIcon className="size-5 text-amber-600 dark:text-amber-400" />;
    }
    return <DatabaseIcon className="size-5 text-blue-600 dark:text-blue-400" />;
}

export function AddDataSourceDialog({
    open,
    onOpenChange,
    onSuccess,
    sourceToEdit = null,
    sourceToReplace = null,
    existingNames = [],
}: AddDataSourceDialogProps) {
    const isEditMode = sourceToEdit !== null;
    const isReplaceMode = sourceToReplace !== null;

    // Wizard step: 1 (Choose), 2 (Configure), 3 (Test & Save)
    const [step, setStep] = useState<number>(isEditMode ? 2 : 1);

    // Connector list from API
    const [connectors, setConnectors] = useState<PublicConnectorDefinition[]>([]);
    const [loadingConnectors, setLoadingConnectors] = useState<boolean>(true);

    // Selection & Config state
    const [selectedType, setSelectedType] = useState<string>(() => (sourceToEdit ? sourceToEdit.type : ''));
    const [name, setName] = useState<string>(() => (sourceToEdit?.name ?? sourceToReplace?.name ?? ''));
    const [config, setConfig] = useState<Record<string, unknown>>(() => (sourceToEdit?.config ? { ...sourceToEdit.config } : {}));

    // UI helper states
    const [showPassword, setShowPassword] = useState<boolean>(false);
    const [isPasswordChanged, setIsPasswordChanged] = useState<boolean>(false);
    const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
    const [connectionUrlInput, setConnectionUrlInput] = useState<string>('');
    const [showUrlBox, setShowUrlBox] = useState<boolean>(false);
    const [urlParseError, setUrlParseError] = useState<string | null>(null);
    const [hostChangedWarning, setHostChangedWarning] = useState<boolean>(false);

    // File upload / preview states
    const [isUploading, setIsUploading] = useState<boolean>(false);
    const [filePreview, setFilePreview] = useState<PreviewResponseData | null>(null);
    const [selectedSheetIndex, setSelectedSheetIndex] = useState<number>(0);
    const [columnTypeOverrides, setColumnTypeOverrides] = useState<Record<string, string>>({});
    const [csvDelimiter, setCsvDelimiter] = useState<string>(',');
    const [csvHasHeader, setCsvHasHeader] = useState<boolean>(true);

    // Test state
    const [isTesting, setIsTesting] = useState<boolean>(false);
    const [testResult, setTestResult] = useState<TestResultState | null>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // Load available connectors
    useEffect(() => {
        if (!open) return;
        fetch('/api/connectors')
            .then((res) => res.json() as Promise<{ data?: PublicConnectorDefinition[] }>)
            .then((json) => {
                if (json.data) {
                    setConnectors(json.data);
                }
            })
            .catch(() => {})
            .finally(() => setLoadingConnectors(false));
    }, [open]);

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setStep(sourceToEdit || sourceToReplace ? 2 : 1);
            setSelectedType(sourceToEdit ? sourceToEdit.type : '');
            setName(sourceToEdit?.name ?? sourceToReplace?.name ?? '');
            setConfig(sourceToEdit?.config ? { ...sourceToEdit.config } : {});
            setTestResult(null);
            setFilePreview(null);
            setShowUrlBox(false);
            setConnectionUrlInput('');
            setUrlParseError(null);
            setHostChangedWarning(false);
            setIsPasswordChanged(false);
            setShowPassword(false);
        }
        onOpenChange(newOpen);
    };

    const activeDefinition = useMemo(() => {
        return connectors.find((c) => c.type === selectedType);
    }, [connectors, selectedType]);

    // Check if network source (not sqlite/csv/excel)
    const isNetworkConnector = useMemo(() => {
        if (!activeDefinition) return false;
        return activeDefinition.category === 'sql' || activeDefinition.category === 'nosql';
    }, [activeDefinition]);

    // Name uniqueness validation
    const nameConflict = useMemo(() => {
        const trimmed = name.trim().toLowerCase();
        if (!trimmed) return false;
        if (isEditMode && sourceToEdit && sourceToEdit.name.toLowerCase() === trimmed) {
            return false;
        }
        return existingNames.some((n) => n.toLowerCase() === trimmed);
    }, [name, isEditMode, sourceToEdit, existingNames]);

    // Handle configuration field change
    const handleFieldChange = (fieldName: string, value: unknown) => {
        setConfig((prev) => {
            const next = { ...prev, [fieldName]: value };
            if (isEditMode && (fieldName === 'host' || fieldName === 'port' || fieldName === 'database')) {
                setHostChangedWarning(true);
            }
            return next;
        });
    };

    // Connection URL parser handler
    const handleApplyConnectionUrl = () => {
        setUrlParseError(null);
        const parsed = parseConnectionUrl(connectionUrlInput, selectedType);
        if (!parsed.success) {
            setUrlParseError(parsed.error);
            return;
        }

        const fields = parsed.fields;
        setConfig((prev) => ({
            ...prev,
            host: fields.host || prev.host,
            port: fields.port || prev.port,
            database: fields.database || prev.database,
            username: fields.username || prev.username,
            password: fields.password || prev.password,
            ssl: fields.ssl || prev.ssl,
            tls: fields.tls !== undefined ? fields.tls : prev.tls,
            authSource: fields.authSource || prev.authSource,
            replicaSet: fields.replicaSet || prev.replicaSet,
        }));

        if (fields.password) {
            setIsPasswordChanged(true);
        }

        setShowUrlBox(false);
        setConnectionUrlInput('');
        toast.success('Connection parameters successfully extracted into fields');
    };

    // File selection & upload for preview
    const handleFileUpload = async (file: File) => {
        setIsUploading(true);
        setFilePreview(null);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/data-sources/upload/preview', {
                method: 'POST',
                body: formData,
            });

            const json = (await res.json()) as { data?: PreviewResponseData; error?: string };
            if (!res.ok || !json.data) {
                throw new Error(json.error || 'Failed to inspect file.');
            }

            setFilePreview(json.data);
            if (!name.trim()) {
                const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
                setName(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
            }
            toast.success('File uploaded and verified');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setIsUploading(false);
        }
    };

    // Live test connection
    const runLiveTest = useCallback(async () => {
        setIsTesting(true);
        setTestResult(null);

        // If file connector with preview token, it is already validated locally
        if (filePreview && !isNetworkConnector) {
            const tableCount = filePreview.preview.tables?.length || (filePreview.preview.sheets?.length ?? 1);
            setTestResult({
                ok: true,
                latencyMs: 1,
                serverVersion: 'SQLite 3 (Embedded)',
                message: 'File verified and ready for import.',
                tableCount,
            });
            setIsTesting(false);
            return;
        }

        try {
            const testPayloadConfig = { ...config };
            if (isEditMode && sourceToEdit && !isPasswordChanged) {
                // Keep stored sentinel so backend decrypts existing password
                testPayloadConfig.password = SECRET_SENTINEL;
            }

            const res = await fetch('/api/data-sources/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: selectedType,
                    config: testPayloadConfig,
                }),
            });

            const json = (await res.json()) as { data?: TestResultState; error?: string };
            if (!res.ok || !json.data) {
                setTestResult({
                    ok: false,
                    message: json.error || 'Failed to connect to data source.',
                });
            } else {
                setTestResult(json.data);
            }
        } catch (err) {
            setTestResult({
                ok: false,
                message: err instanceof Error ? err.message : 'An unexpected error occurred during connection test.',
            });
        } finally {
            setIsTesting(false);
        }
    }, [config, isNetworkConnector, filePreview, selectedType, isEditMode, sourceToEdit, isPasswordChanged]);

    // Go to step 3 and trigger test
    const goToStep3 = () => {
        if (!name.trim()) {
            if (typeof config.database === 'string' && config.database) {
                setName(config.database);
            } else if (filePreview?.fileName) {
                setName(filePreview.fileName.replace(/\.[^/.]+$/, ''));
            } else {
                setName(activeDefinition?.label || 'New Data Source');
            }
        }
        setStep(3);
        void runLiveTest();
    };

    // Final Save handler
    const handleSave = async (forceSave = false) => {
        if (!name.trim() || nameConflict) {
            toast.error('Please enter a unique data source name.');
            return;
        }

        setIsSaving(true);
        try {
            let res: Response;

            if (isReplaceMode && sourceToReplace) {
                // Handled via replace file
                toast.error('Use replace file directly.');
                return;
            }

            if (isEditMode && sourceToEdit) {
                // Update existing
                const updatePayload: Record<string, unknown> = {
                    name: name.trim(),
                    config: {
                        ...config,
                        password: isPasswordChanged ? config.password : SECRET_SENTINEL,
                    },
                };
                if (forceSave) {
                    updatePayload.status = 'error';
                }

                res = await fetch(`/api/data-sources/${sourceToEdit.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatePayload),
                });
            } else if (filePreview) {
                // Create file-based source from preview
                res = await fetch('/api/data-sources', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name.trim(),
                        type: selectedType,
                        previewToken: filePreview.previewToken,
                        options: {
                            delimiter: csvDelimiter,
                            hasHeader: csvHasHeader,
                            columnTypes: columnTypeOverrides,
                            sheetIndex: selectedSheetIndex,
                        },
                    }),
                });
            } else {
                // Create network source
                res = await fetch('/api/data-sources', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name.trim(),
                        type: selectedType,
                        config,
                    }),
                });
            }

            const json = (await res.json()) as { data?: unknown; error?: string };
            if (!res.ok) {
                throw new Error(json.error || 'Failed to save data source.');
            }

            toast.success(isEditMode ? 'Data source updated' : 'Data source created');
            onSuccess();
            onOpenChange(false);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setIsSaving(false);
        }
    };

    // -----------------------------------------------------------------------
    // Render Step 1: Choose Connector
    // -----------------------------------------------------------------------
    const renderStep1 = () => {
        const databases = connectors.filter((c) => c.category === 'sql' && c.type !== 'sqlite');
        const nosql = connectors.filter((c) => c.category === 'nosql');
        const files = connectors.filter((c) => c.category === 'file' || c.type === 'sqlite');

        const renderGroup = (title: string, groupConnectors: PublicConnectorDefinition[]) => (
            <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {title}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {groupConnectors.map((c) => {
                        const isAllowed = c.allowed !== false;
                        const isSelected = selectedType === c.type;
                        return (
                            <button
                                key={c.type}
                                type="button"
                                disabled={!isAllowed}
                                onClick={() => {
                                    if (isAllowed) setSelectedType(c.type);
                                }}
                                onDoubleClick={() => {
                                    if (isAllowed) {
                                        setSelectedType(c.type);
                                        setStep(2);
                                    }
                                }}
                                className={`flex items-start gap-3 p-3 text-left rounded-lg border transition-all ${
                                    !isAllowed
                                        ? 'opacity-50 cursor-not-allowed bg-muted/20 border-border'
                                        : isSelected
                                        ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                                        : 'hover:border-primary/40 hover:bg-muted/30 bg-card'
                                }`}
                            >
                                <div className="mt-0.5 shrink-0">
                                    {getConnectorIcon(c.icon, c.category)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="text-sm font-semibold text-foreground truncate">
                                            {c.label}
                                        </span>
                                        {!isAllowed ? (
                                            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                                                Disabled
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="text-[10px] font-normal">
                                                {c.category === 'file' ? 'File' : 'Network'}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                        {c.description}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        );

        return (
            <div className="space-y-6 max-h-[60vh] overflow-y-auto px-1">
                {loadingConnectors ? (
                    <div className="flex items-center justify-center p-12 text-sm text-muted-foreground gap-2">
                        <Loader2Icon className="size-4 animate-spin" />
                        <span>Loading connectors...</span>
                    </div>
                ) : (
                    <>
                        {databases.length > 0 && renderGroup('Databases', databases)}
                        {nosql.length > 0 && renderGroup('NoSQL', nosql)}
                        {files.length > 0 && renderGroup('Files & Local Storage', files)}
                    </>
                )}
            </div>
        );
    };

    // -----------------------------------------------------------------------
    // Render Step 2: Configure Form
    // -----------------------------------------------------------------------
    const renderStep2Network = () => {
        const portDefault =
            selectedType === 'postgres' ? 5432 :
            selectedType === 'mysql' ? 3306 :
            selectedType === 'mssql' ? 1433 :
            selectedType === 'mongodb' ? 27017 : 5432;

        return (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1">
                {/* Connection URL shortcut */}
                <div className="flex items-center justify-between pb-2 border-b">
                    <div>
                        <p className="text-xs font-semibold text-foreground">Connection Parameters</p>
                        <p className="text-[11px] text-muted-foreground">Configure connection details for {activeDefinition?.label}.</p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => setShowUrlBox(!showUrlBox)}
                    >
                        <LinkIcon className="size-3" />
                        {showUrlBox ? 'Hide URL' : 'Use connection string'}
                    </Button>
                </div>

                {/* Connection String Helper Input */}
                {showUrlBox && (
                    <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
                        <Label className="text-xs font-medium">Paste Connection String / URL</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder={
                                    selectedType === 'mongodb'
                                        ? 'mongodb+srv://user:password@cluster.mongodb.net/dbname'
                                        : `${selectedType}://user:password@hostname:${portDefault}/dbname`
                                }
                                value={connectionUrlInput}
                                onChange={(e) => setConnectionUrlInput(e.target.value)}
                                className="h-8 text-xs font-mono"
                            />
                            <Button type="button" size="sm" onClick={handleApplyConnectionUrl} className="h-8 text-xs shrink-0">
                                Apply
                            </Button>
                        </div>
                        {urlParseError && (
                            <p className="text-[11px] text-destructive font-medium">{urlParseError}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                            Parsed locally in your browser. Connection strings are never stored or logged as a single string.
                        </p>
                    </div>
                )}

                {/* Host Changed Warning */}
                {hostChangedWarning && (
                    <Alert className="py-2 px-3 text-xs bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-400">
                        <AlertTriangleIcon className="size-3.5 shrink-0" />
                        <div className="ml-2">
                            <AlertTitle className="text-xs font-semibold">Connection Host Modified</AlertTitle>
                            <AlertDescription className="text-[11px]">
                                Host, port, or database changed. Testing the connection in Step 3 is recommended.
                            </AlertDescription>
                        </div>
                    </Alert>
                )}

                {/* Primary Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1.5">
                        <Label htmlFor="cfg-host" className="text-xs font-medium">
                            Host <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="cfg-host"
                            placeholder="e.g. db.example.com or localhost"
                            value={String(config.host ?? '')}
                            onChange={(e) => handleFieldChange('host', e.target.value)}
                            className="h-8 text-xs"
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="cfg-port" className="text-xs font-medium">
                            Port <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="cfg-port"
                            type="number"
                            placeholder={String(portDefault)}
                            value={config.port !== undefined ? String(config.port) : ''}
                            onChange={(e) => handleFieldChange('port', parseInt(e.target.value, 10) || undefined)}
                            className="h-8 text-xs font-mono"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="cfg-database" className="text-xs font-medium">
                        Database Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="cfg-database"
                        placeholder="e.g. analytics_db"
                        value={String(config.database ?? '')}
                        onChange={(e) => handleFieldChange('database', e.target.value)}
                        className="h-8 text-xs"
                        required
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="cfg-username" className="text-xs font-medium">
                            Username
                        </Label>
                        <Input
                            id="cfg-username"
                            placeholder="e.g. bi_readonly"
                            value={String(config.username ?? '')}
                            onChange={(e) => handleFieldChange('username', e.target.value)}
                            className="h-8 text-xs"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="cfg-password" className="text-xs font-medium">
                                Password
                            </Label>
                            {isEditMode && !isPasswordChanged && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsPasswordChanged(true);
                                        handleFieldChange('password', '');
                                    }}
                                    className="text-[11px] text-primary hover:underline"
                                >
                                    Change password
                                </button>
                            )}
                        </div>
                        <div className="relative">
                            <Input
                                id="cfg-password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder={isEditMode && !isPasswordChanged ? SECRET_SENTINEL : '••••••••'}
                                value={
                                    isEditMode && !isPasswordChanged
                                        ? SECRET_SENTINEL
                                        : String(config.password ?? '')
                                }
                                disabled={isEditMode && !isPasswordChanged}
                                onChange={(e) => handleFieldChange('password', e.target.value)}
                                className="h-8 text-xs pr-8"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showPassword ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* SSL / TLS Selector */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium">SSL / Encryption</Label>
                    <Select
                        value={String(config.ssl ?? (config.tls ? 'require' : 'disable'))}
                        onValueChange={(val) => {
                            handleFieldChange('ssl', val);
                            handleFieldChange('tls', val !== 'disable');
                        }}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select SSL mode..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="disable">Disable (Plaintext / Local dev)</SelectItem>
                            <SelectItem value="require">Require (Encrypted connection)</SelectItem>
                            <SelectItem value="verify-full">Verify Full (Validate CA Certificate)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Advanced Settings Collapsible */}
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced} className="pt-2 border-t">
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                        <span>Advanced Connection Options</span>
                        <ChevronDownIcon className={`size-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 pt-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="cfg-ca" className="text-xs font-medium">CA Certificate (Optional)</Label>
                            <Textarea
                                id="cfg-ca"
                                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                                value={String(config.sslCa ?? '')}
                                onChange={(e) => handleFieldChange('sslCa', e.target.value)}
                                className="font-mono text-[11px] h-20"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs font-medium">Connect Timeout (ms)</Label>
                                <Input
                                    type="number"
                                    value={Number(config.connectTimeoutMs ?? 10000)}
                                    onChange={(e) => handleFieldChange('connectTimeoutMs', parseInt(e.target.value, 10) || 10000)}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium">Query Timeout (ms)</Label>
                                <Input
                                    type="number"
                                    value={Number(config.queryTimeoutMs ?? 30000)}
                                    onChange={(e) => handleFieldChange('queryTimeoutMs', parseInt(e.target.value, 10) || 30000)}
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>

                        {selectedType === 'mongodb' && (
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium">Auth Source</Label>
                                    <Input
                                        placeholder="admin"
                                        value={String(config.authSource ?? 'admin')}
                                        onChange={(e) => handleFieldChange('authSource', e.target.value)}
                                        className="h-8 text-xs"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium">Replica Set</Label>
                                    <Input
                                        placeholder="rs0"
                                        value={String(config.replicaSet ?? '')}
                                        onChange={(e) => handleFieldChange('replicaSet', e.target.value)}
                                        className="h-8 text-xs"
                                    />
                                </div>
                            </div>
                        )}
                    </CollapsibleContent>
                </Collapsible>
            </div>
        );
    };

    // -----------------------------------------------------------------------
    // Render Step 2: File Upload and Preview
    // -----------------------------------------------------------------------
    const renderStep2File = () => {
        const acceptExtensions =
            selectedType === 'excel' ? '.xlsx,.xlsm' :
            selectedType === 'sqlite' ? '.db,.sqlite,.sqlite3' :
            '.csv,.txt';

        return (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1">
                {/* Upload Dropzone */}
                {!filePreview ? (
                    <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-muted/30 transition-colors flex flex-col items-center justify-center gap-3">
                        <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <UploadCloudIcon className="size-6" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-foreground">
                                Upload your {activeDefinition?.label || 'File'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Drag and drop or browse from your computer ({acceptExtensions})
                            </p>
                        </div>
                        <label className="cursor-pointer">
                            <Input
                                type="file"
                                accept={acceptExtensions}
                                className="hidden"
                                disabled={isUploading}
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) void handleFileUpload(file);
                                }}
                            />
                            <Button type="button" variant="outline" size="sm" disabled={isUploading} className="pointer-events-none gap-2">
                                {isUploading && <Loader2Icon className="size-3.5 animate-spin" />}
                                {isUploading ? 'Inspecting file...' : 'Choose File'}
                            </Button>
                        </label>
                    </div>
                ) : (
                    /* Live Preview of File */
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                            <div className="flex items-center gap-2.5">
                                <FileSpreadsheetIcon className="size-5 text-primary" />
                                <div>
                                    <p className="text-xs font-semibold text-foreground">{filePreview.fileName}</p>
                                    <p className="text-[10px] text-muted-foreground">{formatFileSize(filePreview.size)}</p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setFilePreview(null)}
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            >
                                Replace
                            </Button>
                        </div>

                        {/* Excel Sheet Tabs */}
                        {filePreview.type === 'excel' && filePreview.preview.sheets && filePreview.preview.sheets.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-xs font-medium">Worksheet</Label>
                                <Tabs
                                    value={String(selectedSheetIndex)}
                                    onValueChange={(val) => setSelectedSheetIndex(parseInt(val, 10))}
                                >
                                    <TabsList className="h-8 justify-start overflow-x-auto p-0.5">
                                        {filePreview.preview.sheets.map((s, idx) => (
                                            <TabsTrigger key={s.name} value={String(idx)} className="text-xs h-7 px-3">
                                                {s.name} ({s.rowCountEstimate.toLocaleString()} rows)
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                </Tabs>
                            </div>
                        )}

                        {/* CSV Options */}
                        {filePreview.type === 'csv' && (
                            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border bg-card text-xs">
                                <div className="space-y-1">
                                    <Label className="text-[11px] font-medium">Delimiter</Label>
                                    <Select value={csvDelimiter} onValueChange={(val) => { if (val) setCsvDelimiter(val); }}>
                                        <SelectTrigger className="h-7 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value=",">Comma (,)</SelectItem>
                                            <SelectItem value=";">Semicolon (;)</SelectItem>
                                            <SelectItem value="\t">Tab (\t)</SelectItem>
                                            <SelectItem value="|">Pipe (|)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center justify-between pt-4">
                                    <Label htmlFor="csv-hdr" className="text-[11px] font-medium">Has Header Row</Label>
                                    <Switch id="csv-hdr" checked={csvHasHeader} onCheckedChange={setCsvHasHeader} />
                                </div>
                            </div>
                        )}

                        {/* Preview Sample Table */}
                        {filePreview.preview.sampleRows && filePreview.preview.sampleRows.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-xs font-medium">Sample Preview (First 5 Rows)</Label>
                                <div className="border rounded-md overflow-x-auto max-h-48 text-xs">
                                    <Table>
                                        <TableHeader className="bg-muted/30">
                                            <TableRow>
                                                {(filePreview.preview.columns || []).map((col) => (
                                                    <TableHead key={col.name} className="py-1 px-2.5 text-xs font-mono">
                                                        <div className="flex items-center justify-between gap-1">
                                                            <span className="truncate">{col.name}</span>
                                                            <Select
                                                                value={columnTypeOverrides[col.name] || col.type}
                                                                onValueChange={(val) => {
                                                                    if (val) {
                                                                        setColumnTypeOverrides((prev) => ({
                                                                            ...prev,
                                                                            [col.name]: val,
                                                                        }));
                                                                    }
                                                                }}
                                                            >
                                                                <SelectTrigger className="h-5 text-[9px] uppercase font-mono px-1 border-0 bg-transparent shadow-none hover:bg-muted/50 gap-0.5">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="text" className="text-xs">text</SelectItem>
                                                                    <SelectItem value="number" className="text-xs">number</SelectItem>
                                                                    <SelectItem value="date" className="text-xs">date</SelectItem>
                                                                    <SelectItem value="boolean" className="text-xs">boolean</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filePreview.preview.sampleRows.map((row, rIdx) => (
                                                <TableRow key={rIdx}>
                                                    {row.map((cell, cIdx) => (
                                                        <TableCell key={cIdx} className="py-1 px-2.5 font-mono text-[11px] truncate max-w-xs">
                                                            {cell !== null && cell !== undefined ? String(cell) : <span className="italic text-muted-foreground">null</span>}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}

                        {/* SQLite Tables List */}
                        {filePreview.type === 'sqlite' && filePreview.preview.tables && (
                            <div className="space-y-2">
                                <Label className="text-xs font-medium">Detected Tables & Views</Label>
                                <div className="border rounded-md p-2 divide-y max-h-40 overflow-y-auto text-xs">
                                    {filePreview.preview.tables.map((tbl) => (
                                        <div key={tbl.name} className="flex items-center justify-between py-1.5 px-2">
                                            <span className="font-mono text-xs">{tbl.name}</span>
                                            <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                                                {tbl.type}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // -----------------------------------------------------------------------
    // Render Step 3: Live Test & Name / Save
    // -----------------------------------------------------------------------
    const renderStep3 = () => {
        return (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1">
                {/* Data Source Name input */}
                <div className="space-y-1.5">
                    <Label htmlFor="ds-name" className="text-xs font-medium">
                        Data Source Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="ds-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Production Analytics"
                        className="h-9 text-xs"
                        required
                    />
                    {nameConflict && (
                        <p className="text-[11px] text-destructive font-medium">
                            A data source with this name already exists. Please choose a unique name.
                        </p>
                    )}
                </div>

                {/* Live Test Results Card */}
                <div className="rounded-lg border p-4 bg-card space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Connection Verification</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isTesting}
                            onClick={() => void runLiveTest()}
                            className="h-7 text-xs gap-1.5"
                        >
                            <Loader2Icon className={`size-3 ${isTesting ? 'animate-spin' : ''}`} />
                            {isTesting ? 'Testing...' : 'Retest'}
                        </Button>
                    </div>

                    {isTesting && (
                        <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground justify-center">
                            <Loader2Icon className="size-4 animate-spin text-primary" />
                            <span>Verifying connection to server...</span>
                        </div>
                    )}

                    {!isTesting && testResult && (
                        <div className="space-y-3">
                            {testResult.ok ? (
                                <div className="flex items-start gap-3 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400">
                                    <CheckCircle2Icon className="size-5 shrink-0 mt-0.5" />
                                    <div className="text-xs space-y-0.5">
                                        <p className="font-semibold text-sm">Connection Succeeded</p>
                                        <p>{testResult.message || 'Successfully reached database server.'}</p>
                                        <div className="flex items-center gap-3 pt-1 text-[11px] font-mono">
                                            {testResult.latencyMs !== undefined && (
                                                <span>Latency: {testResult.latencyMs}ms</span>
                                            )}
                                            {testResult.serverVersion && (
                                                <span>Version: {testResult.serverVersion}</span>
                                            )}
                                            {testResult.tableCount !== undefined && (
                                                <span>Tables: {testResult.tableCount}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <Alert variant="destructive">
                                    <AlertCircleIcon className="size-4" />
                                    <AlertTitle className="text-xs font-semibold">Connection Failed</AlertTitle>
                                    <AlertDescription className="text-xs font-mono mt-1">
                                        {testResult.message || 'Unable to connect to the specified host or database.'}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* Warnings */}
                            {testResult.warnings && testResult.warnings.length > 0 && (
                                <div className="space-y-1.5 pt-1">
                                    {testResult.warnings.map((warn, i) => (
                                        <Alert key={i} className="py-2 px-3 text-xs bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-400">
                                            <AlertTriangleIcon className="size-3.5 shrink-0" />
                                            <div className="ml-2 text-[11px]">{warn}</div>
                                        </Alert>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden bg-background">
                {/* Header with 3-Step Stepper */}
                <DialogHeader className="p-4 border-b bg-muted/10 shrink-0">
                    <DialogTitle className="text-base font-semibold">
                        {isEditMode ? `Edit Data Source: ${sourceToEdit?.name}` : 'Add Data Source'}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        {step === 1 && 'Select the connector type for your database or file.'}
                        {step === 2 && `Configure connection parameters for ${activeDefinition?.label || 'data source'}.`}
                        {step === 3 && 'Verify connectivity and name your data source.'}
                    </DialogDescription>
                </DialogHeader>

                {/* Stepper Progress bar */}
                {!isEditMode && (
                    <div className="flex items-center justify-between border-b px-8 py-2.5 bg-muted/20 text-xs">
                        <div className="flex items-center gap-2">
                            <span className={`size-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                1
                            </span>
                            <span className={`font-medium ${step >= 1 ? 'text-foreground' : 'text-muted-foreground'}`}>Connector</span>
                        </div>
                        <div className="h-px w-10 bg-border" />
                        <div className="flex items-center gap-2">
                            <span className={`size-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                2
                            </span>
                            <span className={`font-medium ${step >= 2 ? 'text-foreground' : 'text-muted-foreground'}`}>Configure</span>
                        </div>
                        <div className="h-px w-10 bg-border" />
                        <div className="flex items-center gap-2">
                            <span className={`size-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                3
                            </span>
                            <span className={`font-medium ${step >= 3 ? 'text-foreground' : 'text-muted-foreground'}`}>Test & Save</span>
                        </div>
                    </div>
                )}

                {/* Body Content by Step */}
                <div className="p-5">
                    {step === 1 && renderStep1()}
                    {step === 2 && (isNetworkConnector ? renderStep2Network() : renderStep2File())}
                    {step === 3 && renderStep3()}
                </div>

                {/* Footer Controls */}
                <DialogFooter className="p-4 border-t bg-muted/10 shrink-0 flex items-center justify-between sm:justify-between">
                    <div>
                        {step > 1 && !isEditMode && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setStep(step - 1)}
                                className="h-8 text-xs gap-1.5"
                            >
                                <ArrowLeftIcon className="size-3.5" />
                                Back
                            </Button>
                        )}
                        {step === 3 && isEditMode && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setStep(2)}
                                className="h-8 text-xs gap-1.5"
                            >
                                <ArrowLeftIcon className="size-3.5" />
                                Back to Configure
                            </Button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            className="h-8 text-xs"
                        >
                            Cancel
                        </Button>

                        {step === 1 && (
                            <Button
                                type="button"
                                size="sm"
                                disabled={!selectedType}
                                onClick={() => setStep(2)}
                                className="h-8 text-xs gap-1.5"
                            >
                                Continue
                                <ArrowRightIcon className="size-3.5" />
                            </Button>
                        )}

                        {step === 2 && (
                            <Button
                                type="button"
                                size="sm"
                                disabled={
                                    isNetworkConnector
                                        ? !config.host || !config.database
                                        : !filePreview
                                }
                                onClick={goToStep3}
                                className="h-8 text-xs gap-1.5"
                            >
                                Test & Save
                                <ArrowRightIcon className="size-3.5" />
                            </Button>
                        )}

                        {step === 3 && (
                            <>
                                {testResult && !testResult.ok && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={isSaving || !name.trim() || nameConflict}
                                        onClick={() => void handleSave(true)}
                                        className="h-8 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                                    >
                                        Save anyway
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={
                                        isSaving ||
                                        !name.trim() ||
                                        nameConflict ||
                                        isTesting ||
                                        (testResult !== null && !testResult.ok)
                                    }
                                    onClick={() => void handleSave(false)}
                                    className="h-8 text-xs gap-1.5"
                                >
                                    {isSaving && <Loader2Icon className="size-3.5 animate-spin" />}
                                    {isSaving ? 'Saving...' : 'Save Data Source'}
                                </Button>
                            </>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
