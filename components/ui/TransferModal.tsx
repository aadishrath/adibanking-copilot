'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { Account } from '@/types/account';
import type { Transaction } from '@/types/transaction';
import { parseAmountCents } from '@/lib/money';

interface TransferModalProps {
  accounts: Account[];
  onSuccess?: (result: { accounts: Account[]; transactions: Transaction[] }) => void;
  defaultFrom?: string;
  defaultTo?: string;
};


export default function TransferModal({ accounts, onSuccess, defaultFrom, defaultTo }: TransferModalProps) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string>(defaultFrom ?? accounts?.[0]?.id ?? '');
  const [to, setTo] = useState<string>(defaultTo ?? accounts?.[1]?.id ?? accounts?.[0]?.id ?? '');
  const [amount, setAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestKey = useRef('');
  const pendingRef = useRef(false);

  // Accessibility / focus management
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (open) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      // focus first input when modal opens
      setTimeout(() => firstInputRef.current?.focus(), 0);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
        if (e.key === 'Tab') {
          // simple focus trap
          const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
      return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; };
    }
  }, [open]);

  function openModal() {
    requestKey.current = crypto.randomUUID();
    // Initialize from the latest accounts when opening, without resetting edits
    // whenever the parent refreshes its account array.
    setFrom(defaultFrom ?? accounts[0]?.id ?? '');
    setTo(defaultTo ?? accounts[1]?.id ?? accounts[0]?.id ?? '');
    setError(null);
    setOpen(true);
  }

  function close() {
    if (pendingRef.current) return;
    setOpen(false);
    setAmount('');
    setError(null);
    // return focus to trigger
    setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function validate(): { ok: boolean; message?: string } {
    if (!from || !to) return { ok: false, message: 'Select both accounts.' };
    if (from === to) return { ok: false, message: 'From and To accounts must be different.' };
    let cents: number;
    try { cents = parseAmountCents(amount); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Invalid amount.' }; }
    const fromAcc = accounts.find(a => a.id === from);
    if (!fromAcc) return { ok: false, message: 'Source account not found.' };
    const toAcc = accounts.find(a => a.id === to);
    if (!toAcc || toAcc.currency !== fromAcc.currency) return { ok: false, message: 'Select accounts with matching currencies.' };
    if (cents > (fromAcc.balanceCents ?? Math.round(fromAcc.balance * 100))) return { ok: false, message: 'Insufficient funds in source account.' };
    return { ok: true };
  }

  async function submit() {
    if (pendingRef.current) return;
    setError(null);
    const v = validate();
    if (!v.ok) {
      setError(v.message ?? 'Validation failed');
      return;
    }

    const cents = parseAmountCents(amount);
    pendingRef.current = true;
    setLoading(true);

    try {
      // Update the dashboard only after the server confirms success.
      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fromId: from, toId: to, amountCents: cents, idempotencyKey: requestKey.current }),
      });

      const json = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
      if (!res.ok) {
        setError(json?.error ?? 'Transfer failed');
      } else {
        // server returned new transactions or confirmation
        if (!Array.isArray(json?.accounts) || !Array.isArray(json?.transactions)) throw new Error('Invalid transfer response');
        onSuccess?.({ accounts: json.accounts, transactions: json.transactions });
        pendingRef.current = false;
        close();
      }
    } catch {
      setError('Network error performing transfer');
    } finally {
      pendingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={openModal}
        className="primary-button"
        disabled={accounts.filter(account => !account.status || account.status === 'active').length < 2}
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
            className="relative z-10 w-full max-w-md max-h-[85dvh] overflow-y-auto bg-white rounded-2xl shadow-lg p-4 sm:p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="transfer-title" className="text-lg font-semibold mb-3">
              Transfer funds
            </h3>

            <div className="space-y-3">
              <div>
                <label htmlFor={`${formId}-from`} className="block text-sm font-medium">From</label>
                <select
                  id={`${formId}-from`}
                  ref={firstInputRef}
                  disabled={loading}
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                  className="field-input mt-1"
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
                <label htmlFor={`${formId}-to`} className="block text-sm font-medium">To</label>
                <select
                  id={`${formId}-to`}
                  disabled={loading}
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  className="field-input mt-1"
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
                <label htmlFor={`${formId}-amount`} className="block text-sm font-medium">Amount</label>
                <input
                  id={`${formId}-amount`}
                  disabled={loading}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="field-input mt-1"
                />
              </div>

              {error && <div role="alert" className="text-sm text-red-600">{error}</div>}
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
                className="primary-button"
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
