import { format, startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from 'date-fns';
import type { ChartConfigData, ChartSeriesConfig, DateGrain } from '@src/lib/schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AggregatedSeriesItem {
    key: string;
    label: string;
    column: string;
    aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
    color?: string;
    type?: 'bar' | 'line';
}

export interface AggregatedChartResult {
    columnNames: string[];
    rows: Record<string, unknown>[];
    xAxisKey: string;
    series: AggregatedSeriesItem[];
    seriesKeys: string[];
}

export interface NormalizedData {
    columnNames: string[];
    rows: Record<string, unknown>[];
}

export function normalizeData(
    data?: { columns?: unknown[]; rows?: unknown[][] } | Record<string, unknown>[] | null
): NormalizedData {
    if (!data) return { columnNames: [], rows: [] };

    if (Array.isArray(data)) {
        if (data.length === 0) return { columnNames: [], rows: [] };
        const columnNames = Object.keys(data[0] || {});
        return { columnNames, rows: data };
    }

    if (typeof data === 'object' && 'rows' in data && Array.isArray(data.rows)) {
        const rawCols = data.columns || [];
        const columnNames: string[] = rawCols.map((col, idx) => {
            if (typeof col === 'string') return col;
            if (col && typeof col === 'object' && 'name' in col && typeof col.name === 'string') {
                return col.name;
            }
            return `col_${idx}`;
        });

        const rows = (data.rows as unknown[][]).map((row) => {
            const rowObj: Record<string, unknown> = {};
            columnNames.forEach((colName, idx) => {
                const val = row[idx];
                rowObj[colName] = typeof val === 'bigint' ? Number(val) : val;
            });
            return rowObj;
        });

        return { columnNames, rows };
    }

    return { columnNames: [], rows: [] };
}

// ---------------------------------------------------------------------------
// Date Helpers
// ---------------------------------------------------------------------------

export function parseDateSafe(val: unknown): Date | null {
    if (val === null || val === undefined || val === '') return null;
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val;
    }
    if (typeof val === 'number') {
        if (val >= 1900 && val <= 2100) {
            return new Date(val, 0, 1);
        }
        if (val > 100000000 && val < 10000000000) {
            return new Date(val * 1000);
        }
        if (val >= 10000000000) {
            return new Date(val);
        }
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (/^\d{4}$/.test(trimmed)) {
            return new Date(Number(trimmed), 0, 1);
        }
        if (/^\d{4}-\d{2}$/.test(trimmed)) {
            const [y, m] = trimmed.split('-');
            return new Date(Number(y), Number(m) - 1, 1);
        }
        // Normalize space before time to T for reliable ISO parsing
        const isoLike = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, '$1T$2');
        const d = new Date(isoLike);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

function formatDateWithGrain(
    d: Date,
    grain?: DateGrain,
    customFormat?: string
): { key: string; label: string; timestamp: number } {
    if (customFormat && customFormat !== 'auto') {
        try {
            const label = format(d, customFormat);
            return { key: label, label, timestamp: d.getTime() };
        } catch {
            // fallback
        }
    }

    if (!grain) {
        const dt = startOfDay(d);
        return {
            key: format(dt, 'yyyy-MM-dd'),
            label: format(dt, 'yyyy-MM-dd'),
            timestamp: dt.getTime(),
        };
    }

    switch (grain) {
        case 'day': {
            const dt = startOfDay(d);
            return {
                key: format(dt, 'yyyy-MM-dd'),
                label: format(dt, 'MMM d, yyyy'),
                timestamp: dt.getTime(),
            };
        }
        case 'week': {
            const dt = startOfWeek(d);
            return {
                key: format(dt, 'yyyy-MM-dd'),
                label: `W${format(dt, 'w, yyyy')}`,
                timestamp: dt.getTime(),
            };
        }
        case 'month': {
            const dt = startOfMonth(d);
            return {
                key: format(dt, 'yyyy-MM'),
                label: format(dt, 'MMMM, yyyy'), // "September, 2016"
                timestamp: dt.getTime(),
            };
        }
        case 'quarter': {
            const dt = startOfQuarter(d);
            const q = Math.floor(dt.getMonth() / 3) + 1;
            return {
                key: `${dt.getFullYear()}-Q${q}`,
                label: `Q${q} ${dt.getFullYear()}`,
                timestamp: dt.getTime(),
            };
        }
        case 'year': {
            const dt = startOfYear(d);
            return {
                key: format(dt, 'yyyy'),
                label: format(dt, 'yyyy'),
                timestamp: dt.getTime(),
            };
        }
    }
}

// ---------------------------------------------------------------------------
// Main Aggregator
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers for column matching & sensible defaults
// ---------------------------------------------------------------------------

function findMatchingColumn(columnNames: string[], target?: string | null): string | undefined {
    if (!target) return undefined;
    const trimmed = target.trim();
    if (columnNames.includes(trimmed)) return trimmed;
    const lower = trimmed.toLowerCase();
    return columnNames.find((c) => c.trim().toLowerCase() === lower);
}

function findFirstDateOrTextColumn(rows: Record<string, unknown>[], columnNames: string[]): string | undefined {
    // 1. Column name hint
    const nameMatch = columnNames.find((c) =>
        /date|time|timestamp|month|year|day|category|status|name|region|type/i.test(c)
    );
    if (nameMatch) return nameMatch;

    // 2. Data check: find column where values are dates or non-numeric strings
    for (const col of columnNames) {
        for (const r of rows) {
            const val = r?.[col];
            if (val === null || val === undefined || val === '') continue;
            if (parseDateSafe(val)) return col;
            if (typeof val === 'string' && isNaN(Number(val))) return col;
        }
    }
    return columnNames[0];
}

function findFirstNumericColumn(
    rows: Record<string, unknown>[],
    columnNames: string[],
    excludeCol?: string
): string | undefined {
    const candidates = columnNames.filter((c) => c !== excludeCol);
    // 1. Column name hint
    const nameMatch = candidates.find((c) =>
        /amount|revenue|total|count|price|value|cost|quantity|items|rate|sum|avg/i.test(c)
    );
    if (nameMatch) return nameMatch;

    // 2. Data check: find column where values are numbers
    for (const col of candidates) {
        for (const r of rows) {
            const val = r?.[col];
            if (val === null || val === undefined || val === '') continue;
            if (typeof val === 'number') return col;
            if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) return col;
        }
    }
    return candidates[0] || columnNames[0];
}

// ---------------------------------------------------------------------------
// Main Aggregator
// ---------------------------------------------------------------------------

export function aggregateChartData(
    rows: Record<string, unknown>[],
    config: ChartConfigData,
    columnNames: string[],
    options?: { queryHasGroupBy?: boolean }
): AggregatedChartResult {
    // Ensure config is safe and parsed if passed as string or raw record
    const safeConfig: ChartConfigData =
        typeof config === 'string'
            ? (() => {
                  try {
                      return JSON.parse(config);
                  } catch {
                      return {};
                  }
              })()
            : config || ({} as ChartConfigData);

    const isNormalized = safeConfig.normalize === true;

    if (rows.length === 0 || columnNames.length === 0) {
        return {
            columnNames,
            rows: [],
            xAxisKey: safeConfig.xAxis || columnNames[0] || 'x',
            series: [],
            seriesKeys: [],
        };
    }

    // Resolve exact X axis key from results
    const configuredX =
        findMatchingColumn(columnNames, safeConfig.xAxis) ||
        findMatchingColumn(columnNames, safeConfig.donutLabelColumn);
    const xAxisKey = configuredX || findFirstDateOrTextColumn(rows, columnNames) || columnNames[0] || 'x';

    // Resolve series configs with exact column name matching
    let effectiveSeries: ChartSeriesConfig[] = [];
    if (safeConfig.seriesConfig && safeConfig.seriesConfig.length > 0) {
        for (const s of safeConfig.seriesConfig) {
            const exactCol = findMatchingColumn(columnNames, s.column);
            if (exactCol) {
                effectiveSeries.push({
                    ...s,
                    column: exactCol,
                    label: s.label || exactCol,
                });
            }
        }
    }

    if (effectiveSeries.length === 0 && safeConfig.yAxis && safeConfig.yAxis.length > 0) {
        const yCols = safeConfig.yAxis
            .map((c) => findMatchingColumn(columnNames, c))
            .filter((c): c is string => Boolean(c) && c !== xAxisKey);

        effectiveSeries = yCols.map((c) => ({
            column: c,
            aggregation: 'sum',
            label: c,
        }));
    }

    if (effectiveSeries.length === 0) {
        const fallbackCol =
            findMatchingColumn(columnNames, safeConfig.donutValueColumn) ||
            findMatchingColumn(columnNames, safeConfig.numberValueColumn) ||
            findFirstNumericColumn(rows, columnNames, xAxisKey) ||
            columnNames.find((c) => c !== xAxisKey) ||
            columnNames[0] ||
            'value';

        effectiveSeries = [{ column: fallbackCol, aggregation: 'sum', label: fallbackCol }];
    }

    const splitByCol = safeConfig.splitBy ? findMatchingColumn(columnNames, safeConfig.splitBy) : undefined;
    const isDateGrain = Boolean(safeConfig.xDateGrain);
    const queryHasGroupBy = options?.queryHasGroupBy ?? false;

    // Check if X contains date values for automatic chronological sorting
    let detectedDates = false;

    // If query already grouped, no date grain requested, and no series aggregation override requested
    const shouldPassThrough = queryHasGroupBy && !isDateGrain && !splitByCol;

    if (shouldPassThrough) {
        const seriesItems: AggregatedSeriesItem[] = effectiveSeries.map((s) => ({
            key: s.column,
            label: s.label || s.column,
            column: s.column,
            aggregation: s.aggregation || 'sum',
            color: s.color,
            type: s.type,
        }));
        const sKeys = seriesItems.map((s) => s.key);

        const transformedRows: Record<string, unknown>[] = [];
        for (const r of rows) {
            if (!r) continue;
            const rawX = r[xAxisKey];
            if (rawX === null || rawX === undefined) continue;

            const out: Record<string, unknown> = { ...r };
            sKeys.forEach((k) => {
                const raw = r[k];
                if (typeof raw === 'number') {
                    out[k] = raw;
                } else if (typeof raw === 'string' && raw.trim() !== '' && !isNaN(Number(raw))) {
                    out[k] = Number(raw);
                } else {
                    out[k] = raw;
                }
            });

            const parsedDate = parseDateSafe(rawX);
            if (parsedDate) {
                detectedDates = true;
                out.__timestamp = parsedDate.getTime();
            }
            transformedRows.push(out);
        }

        if (detectedDates || isDateGrain) {
            transformedRows.sort((a, b) => {
                const ta = Number(a.__timestamp) || 0;
                const tb = Number(b.__timestamp) || 0;
                return safeConfig.sortX === 'desc' ? tb - ta : ta - tb;
            });
        } else if (safeConfig.sortX === 'asc') {
            transformedRows.sort((a, b) =>
                String(a[xAxisKey]).localeCompare(String(b[xAxisKey]), undefined, { numeric: true })
            );
        } else if (safeConfig.sortX === 'desc') {
            transformedRows.sort((a, b) =>
                String(b[xAxisKey]).localeCompare(String(a[xAxisKey]), undefined, { numeric: true })
            );
        }

        const cleanedRows = transformedRows.map((row) => {
            const { __timestamp, ...rest } = row;
            void __timestamp;
            return rest;
        });

        return {
            columnNames: Array.from(new Set([xAxisKey, ...sKeys])),
            rows: cleanedRows,
            xAxisKey,
            series: seriesItems,
            seriesKeys: sKeys,
        };
    }

    // -------------------------------------------------------------------------
    // Client-side grouping & aggregation
    // -------------------------------------------------------------------------
    interface GroupAccumulator {
        xKey: string;
        xLabel: string;
        timestamp: number;
        metrics: Record<string, number[]>;
    }

    const groupMap = new Map<string, GroupAccumulator>();
    const foundSplitVals = new Set<string>();

    for (const r of rows) {
        if (!r) continue;
        const rawX = r[xAxisKey];
        if (rawX === null || rawX === undefined) continue;

        let xKey = String(rawX);
        let xLabel = xKey;
        let timestamp = 0;

        const parsed = parseDateSafe(rawX);
        if (parsed) {
            detectedDates = true;
            timestamp = parsed.getTime();
            if (isDateGrain) {
                const formatted = formatDateWithGrain(parsed, safeConfig.xDateGrain, safeConfig.xFormat);
                xKey = formatted.key;
                xLabel = formatted.label;
                timestamp = formatted.timestamp;
            }
        }

        let group = groupMap.get(xKey);
        if (!group) {
            group = {
                xKey,
                xLabel,
                timestamp,
                metrics: {},
            };
            groupMap.set(xKey, group);
        }

        const splitVal = splitByCol ? String(r[splitByCol] ?? 'Unknown') : undefined;
        if (splitVal) foundSplitVals.add(splitVal);

        for (const s of effectiveSeries) {
            const metricKey = splitVal ? `${s.column}___${splitVal}` : s.column;
            if (!group.metrics[metricKey]) {
                group.metrics[metricKey] = [];
            }
            const val = r[s.column];
            let num: number | null = null;
            if (typeof val === 'number') {
                num = val;
            } else if (typeof val === 'string' && val.trim() !== '') {
                const parsedNum = Number(val);
                if (!isNaN(parsedNum)) num = parsedNum;
            }
            if (num !== null) {
                group.metrics[metricKey].push(num);
            }
        }
    }

    // Determine all series items (with split-by expansion if present)
    const aggregatedSeries: AggregatedSeriesItem[] = [];
    if (splitByCol && foundSplitVals.size > 0) {
        const splitList = Array.from(foundSplitVals);
        for (const splitVal of splitList) {
            for (const s of effectiveSeries) {
                const key = `${s.column}___${splitVal}`;
                const label = effectiveSeries.length > 1 ? `${s.label || s.column} (${splitVal})` : splitVal;
                aggregatedSeries.push({
                    key,
                    label,
                    column: s.column,
                    aggregation: s.aggregation || 'sum',
                    color: s.color,
                    type: s.type,
                });
            }
        }
    } else {
        for (const s of effectiveSeries) {
            aggregatedSeries.push({
                key: s.column,
                label: s.label || s.column,
                column: s.column,
                aggregation: s.aggregation || 'sum',
                color: s.color,
                type: s.type,
            });
        }
    }

    // Build finalized rows
    let resultRows = Array.from(groupMap.values()).map((g) => {
        const row: Record<string, unknown> = {
            [xAxisKey]: g.xLabel,
            __timestamp: g.timestamp,
        };

        let rowTotal = 0;
        const computedVals: Record<string, number> = {};

        for (const s of aggregatedSeries) {
            const nums = g.metrics[s.key] || [];
            let val = 0;
            switch (s.aggregation) {
                case 'sum':
                    val = nums.reduce((acc, curr) => acc + curr, 0);
                    break;
                case 'avg':
                    val = nums.length > 0 ? nums.reduce((acc, curr) => acc + curr, 0) / nums.length : 0;
                    break;
                case 'count':
                    val = nums.length;
                    break;
                case 'min':
                    val = nums.length > 0 ? Math.min(...nums) : 0;
                    break;
                case 'max':
                    val = nums.length > 0 ? Math.max(...nums) : 0;
                    break;
            }
            val = Math.round(val * 1000) / 1000;
            computedVals[s.key] = val;
            rowTotal += val;
        }

        // Handle normalize (100% stacked)
        if (isNormalized && rowTotal > 0) {
            for (const s of aggregatedSeries) {
                const fraction = (computedVals[s.key] / rowTotal) * 100;
                row[s.key] = Math.round(fraction * 10) / 10;
            }
        } else {
            for (const s of aggregatedSeries) {
                row[s.key] = computedVals[s.key];
            }
        }

        return row;
    });

    // Sorting: prioritize chronological ordering for dates
    if (detectedDates || isDateGrain) {
        resultRows.sort((a, b) => {
            const ta = Number(a.__timestamp) || 0;
            const tb = Number(b.__timestamp) || 0;
            return safeConfig.sortX === 'desc' ? tb - ta : ta - tb;
        });
    } else if (safeConfig.sortX === 'asc') {
        resultRows.sort((a, b) =>
            String(a[xAxisKey]).localeCompare(String(b[xAxisKey]), undefined, { numeric: true })
        );
    } else if (safeConfig.sortX === 'desc') {
        resultRows.sort((a, b) =>
            String(b[xAxisKey]).localeCompare(String(a[xAxisKey]), undefined, { numeric: true })
        );
    }

    // Clean up temporary internal fields
    resultRows = resultRows.map((row) => {
        const { __timestamp, ...rest } = row;
        void __timestamp;
        return rest;
    });

    const seriesKeys = aggregatedSeries.map((s) => s.key);
    const resultColumnNames = [xAxisKey, ...seriesKeys];

    return {
        columnNames: resultColumnNames,
        rows: resultRows,
        xAxisKey,
        series: aggregatedSeries,
        seriesKeys,
    };
}
