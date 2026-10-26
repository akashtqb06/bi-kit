import { toast } from 'sonner';
import type { ChartConfigData } from './schemas';

export interface FontOption {
    id: string;
    label: string;
    cssFamily: string;
    category: 'system' | 'sans-serif' | 'serif' | 'monospace';
    googleFamily?: string;
}

export const FONT_OPTIONS: FontOption[] = [
    {
        id: 'inherit',
        label: 'App default',
        cssFamily: 'var(--font-sans), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        category: 'system',
    },
    {
        id: 'inter',
        label: 'Inter',
        cssFamily: 'var(--font-inter), "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        category: 'sans-serif',
        googleFamily: 'Inter',
    },
    {
        id: 'roboto',
        label: 'Roboto',
        cssFamily: 'var(--font-roboto), "Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        category: 'sans-serif',
        googleFamily: 'Roboto',
    },
    {
        id: 'open-sans',
        label: 'Open Sans',
        cssFamily: 'var(--font-open-sans), "Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        category: 'sans-serif',
        googleFamily: 'Open Sans',
    },
    {
        id: 'poppins',
        label: 'Poppins',
        cssFamily: 'var(--font-poppins), "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        category: 'sans-serif',
        googleFamily: 'Poppins',
    },
    {
        id: 'lora',
        label: 'Lora',
        cssFamily: 'var(--font-lora), "Lora", Georgia, serif',
        category: 'serif',
        googleFamily: 'Lora',
    },
    {
        id: 'merriweather',
        label: 'Merriweather',
        cssFamily: 'var(--font-merriweather), "Merriweather", Georgia, serif',
        category: 'serif',
        googleFamily: 'Merriweather',
    },
    {
        id: 'playfair-display',
        label: 'Playfair Display',
        cssFamily: 'var(--font-playfair-display), "Playfair Display", Georgia, serif',
        category: 'serif',
        googleFamily: 'Playfair Display',
    },
    {
        id: 'jetbrains-mono',
        label: 'JetBrains Mono',
        cssFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, monospace',
        category: 'monospace',
        googleFamily: 'JetBrains Mono',
    },
    {
        id: 'system-ui',
        label: 'System UI',
        cssFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        category: 'sans-serif',
    },
    {
        id: 'serif',
        label: 'Serif',
        cssFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
        category: 'serif',
    },
    {
        id: 'monospace',
        label: 'Monospace',
        cssFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        category: 'monospace',
    },
];

const FONT_MAP = new Map<string, FontOption>();
for (const opt of FONT_OPTIONS) {
    FONT_MAP.set(opt.id.toLowerCase(), opt);
    FONT_MAP.set(opt.label.toLowerCase(), opt);
    if (opt.googleFamily) {
        FONT_MAP.set(opt.googleFamily.toLowerCase(), opt);
    }
}
// Alias 'playfair' to 'playfair-display'
const playfairOpt = FONT_OPTIONS.find((f) => f.id === 'playfair-display');
if (playfairOpt) {
    FONT_MAP.set('playfair', playfairOpt);
}

/**
 * Returns the CSS font-family stack with fallbacks for a given font ID or name.
 */
export function getFontFamily(id?: string | null): string {
    if (!id || id === 'inherit') {
        const inheritOpt = FONT_MAP.get('inherit');
        return inheritOpt?.cssFamily || 'inherit';
    }
    const found = FONT_MAP.get(id.toLowerCase());
    if (found) {
        return found.cssFamily;
    }
    // If it already looks like a CSS stack or custom value, return as-is
    if (id.includes(',') || id.includes('var(') || id.startsWith('"') || id.startsWith("'")) {
        return id;
    }
    return `"${id}", sans-serif`;
}

/**
 * Resolves the display family name (e.g. "Playfair Display") for font loading and @font-face matching.
 */
export function resolveFontFamilyName(id?: string | null): string | null {
    if (!id) return null;
    if (id === 'inherit') return 'inherit';
    const found = FONT_MAP.get(id.toLowerCase());
    if (found) {
        return found.googleFamily || found.label;
    }
    return id.replace(/['"]/g, '').trim();
}

/**
 * When a font is selected, await document.fonts.load(`16px "${family}"`) before measuring.
 */
export async function loadFont(fontIdOrFamily: string): Promise<void> {
    if (typeof document === 'undefined' || !('fonts' in document) || !document.fonts?.load) {
        return;
    }
    const family = resolveFontFamilyName(fontIdOrFamily);
    if (!family || family === 'inherit' || family === 'System UI' || family === 'Serif' || family === 'Monospace') {
        return;
    }
    try {
        await document.fonts.load(`16px "${family}"`);
    } catch {
        // Silently continue if document.fonts.load is unsupported or fails
    }
}

/**
 * Collect all custom font families used in a chart's textStyle.
 */
export function collectChartFonts(config?: Partial<ChartConfigData> | null): string[] {
    if (!config || !config.textStyle) return [];
    const ts = config.textStyle;
    const candidates = [
        ts.title?.fontFamily,
        ts.subtitle?.fontFamily,
        ts.axisLabels?.fontFamily,
        ts.legend?.fontFamily,
        ts.dataLabels?.fontFamily,
    ];

    const result = new Set<string>();
    for (const c of candidates) {
        if (!c || c === 'inherit') continue;
        const resolved = resolveFontFamilyName(c);
        if (
            resolved &&
            resolved !== 'inherit' &&
            resolved !== 'System UI' &&
            resolved !== 'Serif' &&
            resolved !== 'Monospace'
        ) {
            result.add(resolved);
        }
    }
    return Array.from(result);
}

/**
 * Collect all custom font families used across all charts on a dashboard.
 */
export function collectDashboardFonts(
    charts: Array<{ config?: unknown } | null | undefined>
): string[] {
    const result = new Set<string>();
    for (const c of charts) {
        if (!c || !c.config) continue;
        let cfg = c.config;
        if (typeof cfg === 'string') {
            try {
                cfg = JSON.parse(cfg);
            } catch {
                continue;
            }
        }
        const chartFonts = collectChartFonts(cfg as Partial<ChartConfigData>);
        chartFonts.forEach((f) => result.add(f));
    }
    return Array.from(result);
}

// In-memory cache for base64 @font-face rules per font family name
const fontEmbedCssCache = new Map<string, string>();

/**
 * Builds fontEmbedCSS containing @font-face rules with the font files as data URIs
 * for ONLY the requested families. Fetches woff2 files referenced by document @font-face rules,
 * base64 encodes them, and caches the result per family.
 * If embedding fails for a family, shows a warning toast and falls back to system stack.
 */
export async function buildFontEmbedCSS(fontFamilies: string[]): Promise<string> {
    if (typeof document === 'undefined' || !fontFamilies || fontFamilies.length === 0) {
        return '';
    }

    const cssBlocks: string[] = [];

    for (const family of fontFamilies) {
        if (!family || family === 'inherit') continue;

        // Check cache first
        const cached = fontEmbedCssCache.get(family.toLowerCase());
        if (cached) {
            cssBlocks.push(cached);
            continue;
        }

        try {
            const ruleCss = await extractAndEmbedFontFace(family);
            if (ruleCss) {
                fontEmbedCssCache.set(family.toLowerCase(), ruleCss);
                cssBlocks.push(ruleCss);
            }
        } catch (err) {
            console.warn(`[font-export] Failed to embed font "${family}":`, err);
            toast.warning(`Could not embed font "${family}". Export will use fallback font.`);
        }
    }

    return cssBlocks.join('\n');
}

/**
 * Inspects document stylesheets to find @font-face rules for a specific family,
 * fetches their woff2 src, and turns them into data URIs.
 */
async function extractAndEmbedFontFace(familyName: string): Promise<string | null> {
    const normalizedTarget = familyName.replace(/['"]/g, '').trim().toLowerCase();
    const sheets = Array.from(document.styleSheets);
    const matchedRules: CSSFontFaceRule[] = [];

    for (const sheet of sheets) {
        try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
                if (rule instanceof CSSFontFaceRule || (rule.type === CSSRule.FONT_FACE_RULE && 'style' in rule)) {
                    const faceRule = rule as CSSFontFaceRule;
                    const ruleFamily = faceRule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim().toLowerCase();
                    if (ruleFamily === normalizedTarget) {
                        matchedRules.push(faceRule);
                    }
                }
            }
        } catch {
            // Sheet is cross-origin or restricted; skip
            continue;
        }
    }

    if (matchedRules.length === 0) {
        return null;
    }

    const embeddedRules: string[] = [];

    for (const rule of matchedRules) {
        const srcVal = rule.style.getPropertyValue('src');
        if (!srcVal) continue;

        // Extract url(...) from src
        const urlMatch = srcVal.match(/url\((?:['"]?)(.*?)(?:['"]?)\)/i);
        if (!urlMatch || !urlMatch[1]) continue;

        const fontUrl = urlMatch[1];
        if (fontUrl.startsWith('data:')) {
            // Already a data URI
            embeddedRules.push(rule.cssText);
            continue;
        }

        // Fetch font binary
        const res = await fetch(fontUrl);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} fetching font at ${fontUrl}`);
        }
        const blob = await res.blob();
        const base64DataUri = await blobToDataUrl(blob);

        const fontStyle = rule.style.getPropertyValue('font-style') || 'normal';
        const fontWeight = rule.style.getPropertyValue('font-weight') || '400';
        const fontDisplay = rule.style.getPropertyValue('font-display') || 'swap';

        const synthesizedRule = `@font-face {
  font-family: "${familyName}";
  font-style: ${fontStyle};
  font-weight: ${fontWeight};
  font-display: ${fontDisplay};
  src: url("${base64DataUri}") format("woff2");
}`;
        embeddedRules.push(synthesizedRule);
    }

    return embeddedRules.length > 0 ? embeddedRules.join('\n') : null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error('Failed to convert font blob to base64 data URI'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
