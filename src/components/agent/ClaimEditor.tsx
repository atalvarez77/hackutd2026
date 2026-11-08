'use client';

import { useState } from 'react';
import type { ClaimFlow } from '@/types/statefarm';

export interface ClaimEdit {
  type: string;
  amount: number;
  description: string;
}

/**
 * Lets an agent correct what Nora put on a claim (type, estimate, description) before approving it.
 * Saving goes through the store's editClaim, which updates every tab and the database.
 */
export function ClaimEditor({ claim, onSave, onCancel }: { claim: ClaimFlow; onSave: (edit: ClaimEdit) => void; onCancel: () => void }) {
  const [type, setType] = useState(claim.type);
  const [amount, setAmount] = useState(String(Math.round(claim.amount || 0)));
  const [description, setDescription] = useState(claim.description);
  const parsed = Number(amount.replace(/[$,\s]/g, ''));
  const amountOk = amount.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;
  const valid = type.trim().length > 0 && amountOk;
  const changed = type.trim() !== claim.type || (amountOk && Math.round(parsed) !== Math.round(claim.amount || 0)) || description.trim() !== claim.description;

  const field = 'w-full px-3 rounded-lg border border-white/[.14] bg-void text-ink text-[15px] outline-none focus:border-[#9CC7E3]';

  return (
    <form
      className="flex flex-col gap-3 p-3.5 rounded-[10px] bg-panel-2 border border-white/[.14]"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && changed) onSave({ type: type.trim(), amount: Math.round(parsed), description: description.trim() });
      }}
      aria-label="Edit claim"
    >
      <div className="text-[15px] font-semibold">Edit Nora’s claim</div>
      <label className="flex flex-col gap-1 text-[13px] text-mist">
        Claim type
        <input value={type} onChange={(e) => setType(e.target.value)} className={`${field} h-11`} required />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-mist">
        Estimated amount (USD)
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="numeric"
          className={`${field} h-11 font-mono`}
          aria-invalid={!amountOk}
          aria-describedby={amountOk ? undefined : 'claim-amount-error'}
        />
        {!amountOk && (
          <span id="claim-amount-error" className="text-[13px] text-[#FF6B73]">
            Enter a number, e.g. 3500
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-mist">
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={`${field} py-2 leading-snug resize-y`} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={!valid || !changed} className="h-11 px-4 rounded-lg bg-ink text-panel font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default">
          Save changes
        </button>
        <button type="button" onClick={onCancel} className="h-11 px-4 rounded-lg border border-white/[.14] bg-transparent text-ink cursor-pointer">
          Cancel
        </button>
      </div>
      <p className="m-0 text-[13px] text-mist">The policyholder’s portal and the claim record update right away.</p>
    </form>
  );
}
