'use client';
import { useEffect, useRef, useState } from 'react';
import { Account } from '../../types/account.ts';

interface TransferModalProps {
  accounts: Account[];
  onSuccess?: (result: { fromId: string; toId: string; amount: number; newTransactions?: any[] }) => void;
  defaultFrom?: string;
  defaultTo?: string;
};


export default function TransferModal({ accounts, onSuccess, defaultFrom, defaultTo }: TransferModalProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string>(defaultFrom ?? accounts?.[0]?.id ?? '');
  const [to, setTo] = useState<string>(defaultTo ?? accounts?.[1]?.id ?? accounts?.[0]?.id ?? '');
  const [amount, setAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Accessibility / focus management
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLSelectElement | HTMLInputElement | null>(null);

  useEffect(() => {
    setFrom(defaultFrom ?? accounts?.[0]?.id ?? '');
    setTo(defaultTo ?? accounts?.[1]?.id ?? accounts?.[0]?.id ?? '');
  }, [defaultFrom, defaultTo, accounts]);

  useEffect(() => {
    if (open) {
      // focus first input when modal opens
      setTimeout(() => firstInputRef.current?.focus(), 0);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
        if (e.key === 'Tab') {
          // simple focus trap
          const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (!focusable || focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [open]);

  function openModal() {
    setError(null);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setAmount('');
    setError(null);
    // return focus to trigger
    setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function validate(): { ok: boolean; message?: string } {
    if (!from || !to) return { ok: false, message: 'Select both accounts.' };
    if (from === to) return { ok: false, message: 'From and To accounts must be different.' };
    const n = Number(amount);
    if (Number.isNaN(n) || n <= 0) return { ok: false, message: 'Enter a valid positive amount.' };
    const fromAcc = accounts.find(a => a.id === from);
    if (!fromAcc) return { ok: false, message: 'Source account not found.' };
    if (n > Number(fromAcc.balance)) return { ok: false, message: 'Insufficient funds in source account.' };
    return { ok: true };
  }

  async function submit() {
    setError(null);
    const v = validate();
    if (!v.ok) {
      setError(v.message ?? 'Validation failed');
      return;
    }

    const n = Number(amount);
    setLoading(true);

    // Optimistic UI: call onSuccess immediately to update parent UI
    try {
      onSuccess?.({ fromId: from, toId: to, amount: n });

      // Call server API to perform transfer (atomic server-side)
      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fromId: from, toId: to, amount: n }),
      });

      const json = await res.json();
      if (!res.ok) {
        // rollback: notify parent to re-fetch or provide rollback mechanism
        setError(json?.error ?? 'Transfer failed');
        // Optionally call onSuccess with negative amount to rollback (not implemented here)
      } else {
        // server returned new transactions or confirmation
        onSuccess?.({
          fromId: from,
          toId: to,
          amount: n,
          newTransactions: json.newTransactions ?? [],
        });
        close();
      }
    } catch (err) {
      setError('Network error performing transfer');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={openModal}
        className="px-3 py-2 bg-sky-600 text-white rounded shadow hover:bg-sky-700"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Transfer
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-black/40"
            onClick={close}
            aria-hidden="true"
          />

          <div
            ref={modalRef}
            className="relative z-10 w-full max-w-md bg-white rounded-lg shadow-lg p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="transfer-title" className="text-lg font-semibold mb-3">
              Transfer funds
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium">From</label>
                <select
                  ref={firstInputRef as any}
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                  className="mt-1 block w-full rounded border p-2"
                >
                  <option value="">Select account</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.currency} {Number(a.balance).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">To</label>
                <select
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  className="mt-1 block w-full rounded border p-2"
                >
                  <option value="">Select account</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.currency} {Number(a.balance).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">Amount</label>
                <input
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="mt-1 block w-full rounded border p-2"
                />
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="px-3 py-2 rounded border"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                className="px-3 py-2 rounded bg-sky-600 text-white disabled:opacity-60"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
