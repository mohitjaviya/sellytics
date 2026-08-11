import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Upload, FileText, CheckCircle, XCircle, AlertTriangle,
  ChevronRight, RotateCcw, Download, Loader, Package,
  ShoppingCart, Warehouse, BarChart2, X, Info, Zap, Link2, RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';

// ── Import type definitions ──────────────────────────────────────────────────
const IMPORT_TYPES = [
  {
    id: 'skus',
    label: 'SKUs',
    icon: Package,
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.12)',
    desc: 'Product catalog with pricing',
    columns: ['sku_code*', 'name*', 'brand_name', 'category', 'cost_price*', 'mrp*'],
    example: [
      { sku_code: 'SKU001', name: 'Blue T-Shirt L', brand_name: 'BrandX', category: 'Apparel', cost_price: 150, mrp: 399 },
      { sku_code: 'SKU002', name: 'Black Jeans 32', brand_name: 'BrandY', category: 'Apparel', cost_price: 400, mrp: 999 },
    ],
  },
  {
    id: 'sales-orders',
    label: 'Sales Orders',
    icon: ShoppingCart,
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    desc: 'Historical order data by platform',
    columns: ['sku_code*', 'platform_name*', 'account_name', 'warehouse_name', 'city', 'quantity*', 'sale_price*', 'order_date*'],
    example: [
      { sku_code: 'SKU001', platform_name: 'Amazon', account_name: 'MyStore', warehouse_name: 'Delhi WH', city: 'Delhi', quantity: 10, sale_price: 350, order_date: '2024-01-15' },
      { sku_code: 'SKU002', platform_name: 'Flipkart', account_name: 'MyStore', warehouse_name: 'Mumbai WH', city: 'Mumbai', quantity: 5, sale_price: 880, order_date: '2024-01-16' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Warehouse,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    desc: 'Stock levels per warehouse',
    columns: ['sku_code*', 'warehouse_name*', 'quantity*', 'last_restocked_at'],
    example: [
      { sku_code: 'SKU001', warehouse_name: 'Delhi WH', quantity: 200, last_restocked_at: '2024-01-01' },
      { sku_code: 'SKU002', warehouse_name: 'Mumbai WH', quantity: 150, last_restocked_at: '2024-01-05' },
    ],
  },
  {
    id: 'ad-spend',
    label: 'Ad Spend',
    icon: BarChart2,
    color: '#38bdf8',
    bg: 'rgba(56,189,248,0.12)',
    desc: 'Advertising costs & attributed revenue',
    columns: ['sku_code*', 'platform_name*', 'date*', 'amount*', 'revenue_attributed'],
    example: [
      { sku_code: 'SKU001', platform_name: 'Amazon', date: '2024-01-15', amount: 500, revenue_attributed: 2000 },
      { sku_code: 'SKU002', platform_name: 'Flipkart', date: '2024-01-16', amount: 300, revenue_attributed: 1200 },
    ],
  },
];

// ── Utility: download example CSV ────────────────────────────────────────────
function downloadExample(type) {
  const csv = Papa.unparse(type.example);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `example_${type.id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function TypeSelector({ selected, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
      {IMPORT_TYPES.map(t => {
        const Icon = t.icon;
        const active = selected?.id === t.id;
        return (
          <button
            key={t.id}
            id={`import-type-${t.id}`}
            onClick={() => onChange(t)}
            style={{
              background: active ? t.bg : 'var(--color-surface)',
              border: `1px solid ${active ? t.color : 'var(--color-border)'}`,
              borderRadius: 12,
              padding: '16px 12px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              outline: 'none',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: active ? t.color : 'var(--color-surface-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}>
              <Icon size={18} color={active ? '#fff' : 'var(--color-muted)'} />
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: active ? 'var(--color-text)' : 'var(--color-subtle)' }}>
              {t.label}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', lineHeight: 1.4 }}>{t.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

function ColumnGuide({ type }) {
  return (
    <div style={{
      background: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 20,
      display: 'flex',
      gap: 20,
      alignItems: 'flex-start',
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Required columns <span style={{ color: 'var(--color-subtle)', fontWeight: 400 }}>(* = required)</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {type.columns.map(c => {
            const req = c.endsWith('*');
            const name = req ? c.slice(0, -1) : c;
            return (
              <span key={c} style={{
                background: req ? 'rgba(99,102,241,0.12)' : 'var(--color-surface-3)',
                color: req ? 'var(--color-accent-light)' : 'var(--color-subtle)',
                border: `1px solid ${req ? 'rgba(99,102,241,0.25)' : 'var(--color-border)'}`,
                borderRadius: 6,
                padding: '3px 10px',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                fontWeight: req ? 600 : 400,
              }}>
                {name}{req ? ' *' : ''}
              </span>
            );
          })}
        </div>
      </div>
      <button
        id={`btn-download-example-${type.id}`}
        className="btn btn-secondary btn-sm"
        onClick={() => downloadExample(type)}
        style={{ flexShrink: 0 }}
      >
        <Download size={14} />
        Example CSV
      </button>
    </div>
  );
}

function DropZone({ onFile, isDragging, setIsDragging }) {
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  function handleChange(e) {
    const file = e.target.files[0];
    if (file) onFile(file);
    e.target.value = '';
  }

  return (
    <div
      id="import-dropzone"
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${isDragging ? 'var(--color-accent)' : 'var(--color-border)'}`,
        borderRadius: 14,
        padding: '40px 24px',
        textAlign: 'center',
        cursor: 'pointer',
        background: isDragging ? 'rgba(99,102,241,0.05)' : 'var(--color-surface-2)',
        transition: 'all 0.2s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: 12,
        background: isDragging ? 'rgba(99,102,241,0.15)' : 'var(--color-surface-3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
      }}>
        <Upload size={22} color={isDragging ? 'var(--color-accent-light)' : 'var(--color-muted)'} />
      </div>
      <div>
        <div style={{ fontWeight: 600, color: isDragging ? 'var(--color-accent-light)' : 'var(--color-text)', marginBottom: 4 }}>
          {isDragging ? 'Drop it!' : 'Drop your CSV here or click to browse'}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
          Supports .csv, .xlsx, .xls and .txt
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xls"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}

function ValidationBanner({ errors, validCount, totalCount }) {
  const errorCount = totalCount - validCount;
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <div style={{
        flex: 1, minWidth: 140,
        background: 'rgba(34,197,94,0.08)',
        border: '1px solid rgba(34,197,94,0.2)',
        borderRadius: 10, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <CheckCircle size={20} color="var(--color-success)" />
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-success)' }}>{validCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Valid rows</div>
        </div>
      </div>
      {errorCount > 0 && (
        <div style={{
          flex: 1, minWidth: 140,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 10, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <XCircle size={20} color="var(--color-danger)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-danger)' }}>{errorCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Rows with errors (will be skipped)</div>
          </div>
        </div>
      )}
      <div style={{
        flex: 1, minWidth: 140,
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 10, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <FileText size={20} color="var(--color-muted)" />
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{totalCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Total rows parsed</div>
        </div>
      </div>
    </div>
  );
}

function PreviewTable({ rows, columns, rowErrors }) {
  // Build a set of error row indices
  const errorRowSet = new Set((rowErrors || []).map(e => e.row - 1));

  return (
    <div className="table-wrap" style={{ marginBottom: 16 }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 48 }}>#</th>
            {columns.map(c => (
              <th key={c}>{c.replace('*', '')}</th>
            ))}
            <th style={{ width: 80 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, idx) => {
            const hasError = errorRowSet.has(idx);
            return (
              <tr key={idx} style={{ background: hasError ? 'rgba(239,68,68,0.04)' : undefined }}>
                <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>{idx + 1}</td>
                {columns.map(c => {
                  const col = c.replace('*', '');
                  return (
                    <td key={c} style={{
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: !row[col] && row[col] !== 0 ? 'var(--color-danger)' : undefined,
                    }}>
                      {row[col] ?? <span style={{ color: 'var(--color-danger)', fontStyle: 'italic' }}>missing</span>}
                    </td>
                  );
                })}
                <td>
                  {hasError
                    ? <span className="badge badge-danger">Error</span>
                    : <span className="badge badge-success">OK</span>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ErrorList({ errors }) {
  if (!errors || errors.length === 0) return null;
  return (
    <div style={{
      background: 'rgba(239,68,68,0.05)',
      border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 16,
      maxHeight: 200,
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <AlertTriangle size={15} color="var(--color-danger)" />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-danger)' }}>
          {errors.length} validation {errors.length === 1 ? 'error' : 'errors'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {errors.slice(0, 30).map((e, i) => {
          const msg = typeof e === 'string' ? e : `Row ${e.row}: ${e.issues.join(', ')}`;
          return (
            <div key={i} style={{ fontSize: '0.78rem', color: 'var(--color-danger)', fontFamily: 'monospace', opacity: 0.9 }}>
              • {msg}
            </div>
          );
        })}
        {errors.length > 30 && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 4 }}>
            …and {errors.length - 30} more
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DataImport() {
  const [selectedType, setSelectedType] = useState(IMPORT_TYPES[0]);
  const [isDragging,   setIsDragging]   = useState(false);
  const [fileName,     setFileName]     = useState('');

  // State machine: idle | previewing | importing | done | error
  const [stage,    setStage]    = useState('idle');
  const [parsedRows, setParsedRows] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [validCount,  setValidCount]  = useState(0);
  const [result,   setResult]   = useState(null);
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Helper to map marketplace specific headers (Flipkart, Amazon, Meesho)
  function normalizeRows(rawRows, typeId) {
    if (typeId !== 'sales-orders' || rawRows.length === 0) {
      // For non-sales types just normalise keys
      return rawRows.map(r => {
        const row = {};
        for (const [k, v] of Object.entries(r)) {
          if (!k) continue;
          row[String(k).trim().toLowerCase().replace(/[\s-]+/g, '_')] = typeof v === 'string' ? v.trim() : v;
        }
        return row;
      });
    }

    // Detect platform from the first row's headers. Strip ALL non-alphanumeric
    // characters so detection works whether the file is XLSX (raw "Sub Order No")
    // or CSV (Papa has already turned it into "sub_order_no").
    const flatKeys = Object.keys(rawRows[0]).map(k => k.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    let detectedPlatform = null;

    if (flatKeys.some(k => k.includes('amazonorderid') || k === 'asin'))
      detectedPlatform = 'amazon';
    else if (flatKeys.some(k => k.includes('suborderno') || k.includes('catalogid') || k.includes('reasonforcreditentry')))
      detectedPlatform = 'meesho';
    else if (flatKeys.some(k => k.includes('productid') || k.includes('fulfillmenttype') || k === 'gmv' || k.includes('finalsale')))
      detectedPlatform = 'flipkart';

    return rawRows.map(r => {
      const row = {};
      // Normalise keys: trim, lowercase, replace spaces & hyphens with underscores
      for (const [k, v] of Object.entries(r)) {
        if (!k) continue;
        const normKey = String(k).trim().toLowerCase().replace(/[\s-]+/g, '_');
        row[normKey] = typeof v === 'string' ? v.trim() : v;
      }

      // ── Amazon Auto-Mapper ──────────────────────────────────────────────
      if (detectedPlatform === 'amazon') {
        // sku field is literally "sku" → sku_code
        if (row.sku && !row.sku_code) row.sku_code = row.sku;
        // purchase_date → order_date  (strip time if ISO)
        if (row.purchase_date && !row.order_date) {
          const d = String(row.purchase_date);
          row.order_date = d.length > 10 ? d.slice(0, 10) : d;
        }
        // Amazon "item-price" is the LINE TOTAL (unit price × quantity). Store
        // per-unit so revenue (quantity × sale_price) isn't double-counted.
        if (row.item_price !== undefined && row.sale_price === undefined) {
          const qty = parseFloat(row.quantity);
          const amt = parseFloat(row.item_price);
          row.sale_price = (qty && qty > 0) ? amt / qty : amt;
        }
        // quantity already matches
        // ship_city → city
        if (row.ship_city && !row.city) row.city = row.ship_city;
        if (!row.platform_name) row.platform_name = 'Amazon';
        if (!row.account_name) row.account_name = 'Amazon Store';
      }

      // ── Meesho Auto-Mapper ──────────────────────────────────────────────
      else if (detectedPlatform === 'meesho') {
        // "sku" key already normalised to row.sku → sku_code
        if (row.sku && !row.sku_code) row.sku_code = row.sku;
        // order_date already matches
        // quantity already matches
        // supplier_listed_price_(incl._gst_+_commission) or supplier_discounted_price → sale_price
        const priceKey = Object.keys(row).find(k => k.startsWith('supplier_discounted_price') || k.startsWith('supplier_listed_price'));
        if (priceKey && row.sale_price === undefined) row.sale_price = row[priceKey];
        // customer_state → city (best available location info)
        if (row.customer_state && !row.city) row.city = row.customer_state;
        if (!row.platform_name) row.platform_name = 'Meesho';
        if (!row.account_name) row.account_name = 'Meesho Store';
      }

      // ── Flipkart Auto-Mapper ────────────────────────────────────────────
      else if (detectedPlatform === 'flipkart') {
        if (row.sku_id && !row.sku_code) row.sku_code = row.sku_id;

        // Units: prefer net "Final Sale Units", fall back to gross units
        const units = row.final_sale_units !== undefined ? parseFloat(row.final_sale_units)
                    : row.gross_units      !== undefined ? parseFloat(row.gross_units)
                    : undefined;
        if (units !== undefined && row.quantity === undefined) row.quantity = units;

        // "Final Sale Amount" / "GMV" are LINE TOTALS (units × price). The app
        // computes revenue as quantity × sale_price, so store a PER-UNIT price —
        // otherwise the quantity is counted twice and revenue is inflated.
        const amount = row.final_sale_amount !== undefined ? parseFloat(row.final_sale_amount)
                     : row.gmv              !== undefined ? parseFloat(row.gmv)
                     : undefined;
        if (amount !== undefined && row.sale_price === undefined) {
          row.sale_price = (units && units > 0) ? amount / units : amount;
        }

        if (!row.platform_name) row.platform_name = 'Flipkart';
        if (!row.account_name) row.account_name = 'Flipkart Store';
      }

      return row;
    });
  }

  function processParsedData(rawData) {
    const data = normalizeRows(rawData, selectedType.id);

    if (data.length === 0) {
      setApiError('No data rows found in the file. Make sure it has a header row.');
      return;
    }

    const required = selectedType.columns
      .filter(c => c.endsWith('*'))
      .map(c => c.slice(0, -1));

    const rowErrors = [];
    let valid = 0;

    data.forEach((row, idx) => {
      const issues = required.filter(f => row[f] === undefined || row[f] === null || row[f] === '').map(f => `missing "${f}"`);
      if (issues.length) rowErrors.push({ row: idx + 1, issues });
      else valid++;
    });

    setParsedRows(data);
    setParseErrors(rowErrors);
    setValidCount(valid);
    setStage('previewing');
  }

  // ── Parse File (CSV or Excel) ───────────────────────────────────────────────
  function handleFile(file) {
    setFileName(file.name);
    setApiError('');
    setResult(null);

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target.result;
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawData = XLSX.utils.sheet_to_json(firstSheet);
          processParsedData(rawData);
        } catch (err) {
          setApiError(`Could not parse Excel file: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim().toLowerCase().replace(/\s+/g, '_'),
        transform: v => typeof v === 'string' ? v.trim() : v,
        complete: ({ data }) => processParsedData(data),
        error: (err) => setApiError(`Could not parse file: ${err.message}`),
      });
    }
  }

  // ── Confirm import ─────────────────────────────────────────────────────────
  async function handleConfirm() {
    setIsLoading(true);
    setApiError('');
    try {
      // Route through the api client so the Supabase JWT is attached —
      // the backend rejects unauthenticated /api/import calls with a 401.
      const json = await api.post(`/api/import/${selectedType.id}`, { rows: parsedRows });
      setResult(json);
      setStage('done');
    } catch (err) {
      setApiError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function reset() {
    setStage('idle');
    setParsedRows([]);
    setParseErrors([]);
    setValidCount(0);
    setResult(null);
    setApiError('');
    setFileName('');
  }

  function handleTypeChange(t) {
    setSelectedType(t);
    reset();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Data Import</h1>
          <p>Bulk upload historical data via CSV</p>
        </div>
        {stage !== 'idle' && (
          <button id="btn-reset-import" className="btn btn-ghost btn-sm" onClick={reset}>
            <RotateCcw size={14} /> Start over
          </button>
        )}
      </div>

      {/* Direct API Auto-Sync Banner */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 20px', background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(167,139,250,0.05) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent-light)' }}>
              <Zap size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Direct Marketplace API Auto-Sync</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>Skip manual CSV/Excel file uploads by connecting Amazon SP-API, Flipkart &amp; Meesho directly.</div>
            </div>
          </div>
          <Link to="/settings" className="btn btn-secondary btn-sm">
            <Link2 size={13} /> Configure API Keys in Settings
          </Link>
        </div>
      </div>

      {/* Type selector */}
      <TypeSelector selected={selectedType} onChange={handleTypeChange} />

      {/* Column guide */}
      <ColumnGuide type={selectedType} />

      {/* ── Stage: idle ─────────────────────────────────────────────────────── */}
      {stage === 'idle' && (
        <DropZone
          onFile={handleFile}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
        />
      )}

      {/* API / parse error */}
      {apiError && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 10,
          padding: '12px 16px',
          marginTop: 16,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          fontSize: '0.875rem',
          color: 'var(--color-danger)',
        }}>
          <XCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{apiError}</span>
        </div>
      )}

      {/* ── Stage: previewing ────────────────────────────────────────────────── */}
      {stage === 'previewing' && (
        <div className="animate-fade-in">
          {/* File info bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 10, padding: '10px 14px',
            marginBottom: 16,
          }}>
            <FileText size={16} color="var(--color-accent-light)" />
            <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500 }}>{fileName}</span>
            <button className="btn btn-ghost btn-icon" onClick={reset} title="Remove file">
              <X size={15} />
            </button>
          </div>

          {/* Validation summary */}
          <ValidationBanner
            errors={parseErrors}
            validCount={validCount}
            totalCount={parsedRows.length}
          />

          {/* Row errors */}
          <ErrorList errors={parseErrors} />

          {/* Preview notice */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Info size={13} color="var(--color-muted)" />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
              Showing first {Math.min(20, parsedRows.length)} of {parsedRows.length} rows. Error rows will be skipped on import.
            </span>
          </div>

          {/* Preview table */}
          <PreviewTable
            rows={parsedRows}
            columns={selectedType.columns}
            rowErrors={parseErrors}
          />

          {/* Warning for SKU dependency */}
          {(selectedType.id === 'sales-orders' || selectedType.id === 'inventory' || selectedType.id === 'ad-spend') && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 10, padding: '10px 14px',
              marginBottom: 16, fontSize: '0.8rem', color: 'var(--color-warning)',
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                SKU codes in this file must already exist in the database.
                Import SKUs first if you haven't done so.
              </span>
            </div>
          )}

          {/* Confirm button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button id="btn-cancel-import" className="btn btn-secondary" onClick={reset}>
              Cancel
            </button>
            <button
              id="btn-confirm-import"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={validCount === 0 || isLoading}
              style={{ minWidth: 160, justifyContent: 'center' }}
            >
              {isLoading
                ? <><Loader size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> Importing…</>
                : <><ChevronRight size={15} /> Import {validCount} rows</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Stage: done ──────────────────────────────────────────────────────── */}
      {stage === 'done' && result && (
        <div className="animate-fade-in">
          <div style={{
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 14,
            padding: '32px 28px',
            textAlign: 'center',
            marginBottom: 20,
          }}>
            <CheckCircle size={48} color="var(--color-success)" style={{ marginBottom: 12 }} />
            <h2 style={{ marginBottom: 6 }}>Import Successful!</h2>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: 24 }}>
              Your {selectedType.label.toLowerCase()} data has been saved to the database.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 24px', minWidth: 120 }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2rem', fontWeight: 700, color: 'var(--color-success)' }}>{result.inserted}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Rows inserted</div>
              </div>
              {result.skipped > 0 && (
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 24px', minWidth: 120 }}>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2rem', fontWeight: 700, color: 'var(--color-warning)' }}>{result.skipped}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Rows skipped</div>
                </div>
              )}
            </div>
          </div>

          {/* Backend errors if any */}
          {result.errors && result.errors.length > 0 && (
            <ErrorList errors={result.errors} />
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <button id="btn-import-again" className="btn btn-primary" onClick={reset}>
              <Upload size={15} /> Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
