'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  UploadCloudIcon,
  FileTextIcon,
  SparklesIcon,
  Building2Icon,
  CheckIcon,
} from 'lucide-react';
import { useFinanceStore } from '@src/components/finance/shared/finance-store';
import { formatINR } from '@src/components/finance/shared/format';
import { SAMPLE_FIXTURES, type SampleFixture } from '@src/lib/finance/import/sample-fixtures';
import {
  getCsvQuickPreview,
  parseAndProcessStatement,
} from '@src/lib/finance/import/parser';
import { buildDefaultRules, learnRulesFromTransactions } from '@src/lib/finance/import/categorizer';
import { ColumnMappingStep } from './column-mapping-step';
import { TransactionReviewStep } from './transaction-review-step';
import { ImportSummaryDialog } from './import-summary-dialog';
import { commitImportAction } from '@src/app/(app)/finance/import/actions';
import type {
  CategorizationRule,
  ColumnMapping,
  CommitImportResult,
  DateFormat,
  NumberFormatConfig,
  ParsedImportRow,
} from '@src/lib/finance/import/types';

export function ImportWizard() {
  const {
    accounts,
    categories,
    transactions,
    lastUsedAccountId,
    setLastUsedAccountId,
    addTransaction,
    initialize,
  } = useFinanceStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Current wizard step
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Target Account
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    return lastUsedAccountId || (accounts.length > 0 ? accounts[0].id : '');
  });

  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const targetAccount = useMemo(() => {
    return accounts.find((a) => a.id === selectedAccountId);
  }, [accounts, selectedAccountId]);

  const isTargetCreditCard = targetAccount?.kind === 'credit_card';

  // File and content state
  const [_fileName, setFileName] = useState<string>('');
  const [_fileSize, setFileSize] = useState<number>(0);
  const [csvContent, setCsvContent] = useState<string>('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);

  // Mapping & formats
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [dateFormat, setDateFormat] = useState<DateFormat>('DD/MM/YYYY');
  const [numberFormat, setNumberFormat] = useState<NumberFormatConfig>({
    decimalSeparator: '.',
    thousandsSeparator: ',',
  });
  const [isCreditCardConvention, setIsCreditCardConvention] = useState<boolean>(false);

  // Categorization Rules
  const [userRules, setUserRules] = useState<CategorizationRule[]>([]);
  const [newlyCreatedRules, setNewlyCreatedRules] = useState<
    Array<{ keyword: string; categoryId: string }>
  >([]);

  // Initialize rules from default categories & existing transactions
  useEffect(() => {
    if (categories.length > 0) {
      const defaults = buildDefaultRules(categories);
      const learned = learnRulesFromTransactions(transactions, defaults);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserRules(learned);
    }
  }, [categories, transactions]);

  // Processed rows
  const [processedRows, setProcessedRows] = useState<ParsedImportRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitImportResult | null>(null);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);

  // Existing hashes from in-memory / loaded transactions
  const existingHashes = useMemo(() => {
    const hashes = new Set<string>();
    for (const t of transactions) {
      if (t.importHash) hashes.add(t.importHash);
    }
    return hashes;
  }, [transactions]);

  // Handle file select or drag & drop
  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      toast.error('Please upload a valid .csv bank or card statement');
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      processUploadedText(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSelectSample = (sample: SampleFixture) => {
    setFileName(sample.filename);
    setFileSize(sample.content.length);

    // Auto-select a matching account kind if possible
    if (sample.accountKind === 'credit_card') {
      const cardAcc = accounts.find((a) => a.kind === 'credit_card');
      if (cardAcc) setSelectedAccountId(cardAcc.id);
      setIsCreditCardConvention(true);
    } else {
      const bankAcc = accounts.find((a) => a.kind === 'bank');
      if (bankAcc) setSelectedAccountId(bankAcc.id);
      setIsCreditCardConvention(false);
    }

    processUploadedText(sample.content, sample.filename, sample.accountKind === 'credit_card');
  };

  const processUploadedText = (
    text: string,
    name: string,
    forceCreditCard?: boolean
  ) => {
    setCsvContent(text);

    // 1. Quick preview headers
    const preview = getCsvQuickPreview(text, 5);
    setRawHeaders(preview.headers);
    setSampleRows(preview.previewRows);

    // 2. Initial processing with auto-detection
    const isCard = forceCreditCard !== undefined ? forceCreditCard : isTargetCreditCard;
    setIsCreditCardConvention(isCard);

    const result = parseAndProcessStatement(text, {
      rules: userRules,
      existingHashes,
      isCreditCard: isCard,
    });

    setColumnMapping(result.detectedMapping);
    setDateFormat(result.detectedDateFormat);
    setNumberFormat(result.detectedNumberFormat);
    setProcessedRows(result.rows);

    toast.success(`Loaded "${name}" with ${result.totalRowsParsed} transactions detected`);
    setStep(2);
  };

  // Re-run processor when mapping or format changes in Step 2
  const handleProceedToReview = () => {
    if (!columnMapping || !csvContent) return;

    const result = parseAndProcessStatement(csvContent, {
      mapping: columnMapping,
      dateFormat,
      numberFormat,
      isCreditCard: isCreditCardConvention,
      rules: userRules,
      existingHashes,
    });

    setProcessedRows(result.rows);
    setStep(3);
  };

  // Add a user-defined categorization rule
  const handleAddRule = (keyword: string, categoryId: string) => {
    const newRule: CategorizationRule = {
      id: `rule-user-${keyword}`,
      keyword,
      categoryId,
    };
    setUserRules((prev) => [...prev.filter((r) => r.keyword !== keyword), newRule]);
    setNewlyCreatedRules((prev) => [...prev.filter((r) => r.keyword !== keyword), { keyword, categoryId }]);
    toast.success(`Rule saved: Always map "${keyword}" to category`);
  };

  // Commit selected transactions in one atomic transaction
  const handleCommit = async () => {
    if (!targetAccount) {
      toast.error('Please choose a valid destination account');
      return;
    }

    const includedRows = processedRows.filter((r) => r.included && r.isValid);
    if (includedRows.length === 0) {
      toast.error('No transactions selected for import');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Attempt Server Action commit to PostgreSQL
      const serverResult = await commitImportAction({
        accountId: targetAccount.id,
        rows: includedRows.map((r) => ({
          date: r.date || '1970-01-01',
          description: r.description,
          payee: r.payee,
          type: r.type,
          amountPaise: r.amountPaise,
          signedAmountPaise: r.signedAmountPaise,
          categoryId: r.selectedCategoryId,
          importHash: r.importHash,
          note: r.description,
        })),
        newRules: newlyCreatedRules,
      });

      // 2. Optimistically add transactions to the client finance store
      for (const r of includedRows) {
        await addTransaction(
          {
            accountId: targetAccount.id,
            date: r.date || '1970-01-01',
            type: r.type,
            amount: r.amountPaise,
            categoryId: r.selectedCategoryId || undefined,
            payee: r.payee || undefined,
            note: r.description,
          },
          `import-${r.importHash}`
        );
      }

      setLastUsedAccountId(targetAccount.id);

      const finalResult: CommitImportResult = {
        success: true,
        importedCount: includedRows.length,
        duplicatesSkippedCount: processedRows.filter((r) => r.isDuplicate && !r.included).length,
        errorCount: processedRows.filter((r) => !r.isValid).length,
        transactionIds: serverResult?.transactionIds || [],
        targetAccountId: targetAccount.id,
      };

      setCommitResult(finalResult);
      setSummaryDialogOpen(true);
      toast.success(`Successfully imported ${includedRows.length} transactions`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import transactions');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setFileName('');
    setCsvContent('');
    setProcessedRows([]);
    setCommitResult(null);
    setSummaryDialogOpen(false);
    setNewlyCreatedRules([]);
  };

  return (
    <div className="space-y-6">
      {/* Wizard Step Progress Tracker */}
      <div className="flex items-center justify-between max-w-xl mx-auto py-2">
        <div className="flex items-center gap-2">
          <div
            className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold ${
              step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {step > 1 ? <CheckIcon className="h-4 w-4" /> : '1'}
          </div>
          <span className={`text-xs font-medium ${step >= 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
            Upload
          </span>
        </div>
        <div className="flex-1 h-0.5 bg-border mx-3" />
        <div className="flex items-center gap-2">
          <div
            className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold ${
              step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {step > 2 ? <CheckIcon className="h-4 w-4" /> : '2'}
          </div>
          <span className={`text-xs font-medium ${step >= 2 ? 'text-foreground' : 'text-muted-foreground'}`}>
            Mapping & Formats
          </span>
        </div>
        <div className="flex-1 h-0.5 bg-border mx-3" />
        <div className="flex items-center gap-2">
          <div
            className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold ${
              step === 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            3
          </div>
          <span className={`text-xs font-medium ${step === 3 ? 'text-foreground' : 'text-muted-foreground'}`}>
            Review & Commit
          </span>
        </div>
      </div>

      {/* STEP 1: Upload and Sample Selection */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Target Account Selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2Icon className="h-4 w-4 text-primary" />
                Select Destination Account
              </CardTitle>
              <CardDescription className="text-xs">
                Transactions from your statement will be imported into this account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <div className="p-4 rounded-lg bg-muted/40 text-center text-xs text-muted-foreground">
                  No accounts found. Please create a bank or credit card account first in the Accounts tab.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={`text-left p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                        selectedAccountId === acc.id
                          ? 'border-primary ring-1 ring-primary bg-primary/5 shadow-xs'
                          : 'border-border hover:border-muted-foreground/30 bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-xs truncate mr-2">{acc.name}</span>
                        {acc.kind === 'credit_card' ? (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                            Card
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                            {acc.kind}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        Balance: {formatINR(acc.balance)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed rounded-xl p-8 text-center transition-colors hover:border-primary/50 bg-card/50 flex flex-col items-center justify-center space-y-3 cursor-pointer"
            onClick={() => document.getElementById('csv-file-input')?.click()}
          >
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <UploadCloudIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Click to browse or drag and drop your bank / card CSV
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports HDFC, Axis, SBI, ICICI, Credit Cards, and standard statement CSV formats
              </p>
            </div>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFile(e.target.files[0]);
                }
              }}
            />
          </div>

          {/* Quick Sample Statements */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <SparklesIcon className="h-3.5 w-3.5 text-primary" />
                Or Try Sample Statements (from S4 Fixtures)
              </span>
              <span className="text-[11px] text-muted-foreground">Click to load instantly</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {SAMPLE_FIXTURES.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => handleSelectSample(sample)}
                  className="text-left p-3.5 rounded-lg border bg-card hover:border-primary/50 hover:shadow-xs transition-all cursor-pointer space-y-1.5 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs group-hover:text-primary transition-colors">
                      {sample.name}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {sample.bankName}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {sample.description}
                  </p>
                  <div className="text-[10px] text-primary/80 font-mono pt-1 flex items-center gap-1">
                    <FileTextIcon className="h-3 w-3" />
                    {sample.filename}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Column Mapping & Formats */}
      {step === 2 && columnMapping && (
        <ColumnMappingStep
          headers={rawHeaders}
          sampleRows={sampleRows}
          mapping={columnMapping}
          dateFormat={dateFormat}
          numberFormat={numberFormat}
          isCreditCard={isCreditCardConvention}
          onMappingChange={setColumnMapping}
          onDateFormatChange={setDateFormat}
          onNumberFormatChange={setNumberFormat}
          onCreditCardChange={setIsCreditCardConvention}
          onBack={() => setStep(1)}
          onProceed={handleProceedToReview}
        />
      )}

      {/* STEP 3: Transaction Review & Categorization */}
      {step === 3 && (
        <TransactionReviewStep
          rows={processedRows}
          categories={categories}
          accountName={targetAccount?.name || 'Selected Account'}
          isSubmitting={isSubmitting}
          onRowsChange={setProcessedRows}
          onBack={() => setStep(2)}
          onCommit={handleCommit}
          onAddRule={handleAddRule}
        />
      )}

      {/* Summary Dialog */}
      <ImportSummaryDialog
        open={summaryDialogOpen}
        result={commitResult}
        accountName={targetAccount?.name || 'Account'}
        onClose={() => setSummaryDialogOpen(false)}
        onReset={handleReset}
      />
    </div>
  );
}
