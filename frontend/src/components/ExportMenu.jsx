import { useState, useRef, useEffect } from 'react';
import { Download, FileText, Printer } from 'lucide-react';

export default function ExportMenu({ data = [], filename = 'export', columns = [] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExportCSV = () => {
    if (!data || data.length === 0) return;

    const headers = columns.length > 0 ? columns : Object.keys(data[0]);
    const csvRows = [];

    csvRows.push(headers.map(h => `"${(h.label || h).replace(/"/g, '""')}"`).join(','));

    for (const row of data) {
      const values = headers.map(h => {
        const key = h.key || h;
        const val = row[key] !== undefined && row[key] !== null ? String(row[key]) : '';
        return `"${val.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const handlePrintPDF = () => {
    setOpen(false);
    window.print();
  };

  const itemStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 14px',
    fontSize: '0.85rem',
    color: 'var(--color-subtle)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.12s, color 0.12s',
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={menuRef} className="no-print">
      <button className="btn btn-secondary" onClick={() => setOpen(o => !o)}>
        <Download size={15} /> Export
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, marginTop: 8, width: 210, zIndex: 50,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          overflow: 'hidden', padding: '4px 0',
          animation: 'fadeIn 0.12s ease',
        }}>
          <button
            style={itemStyle}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-2)'; e.currentTarget.style.color = 'var(--color-text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-subtle)'; }}
            onClick={handleExportCSV}
          >
            <FileText size={15} color="var(--color-success)" /> Export to CSV
          </button>
          <button
            style={itemStyle}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-2)'; e.currentTarget.style.color = 'var(--color-text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-subtle)'; }}
            onClick={handlePrintPDF}
          >
            <Printer size={15} color="var(--color-accent-light)" /> Print / Save as PDF
          </button>
        </div>
      )}
    </div>
  );
}
