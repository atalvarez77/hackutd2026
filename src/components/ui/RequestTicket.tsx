export function RequestTicket({ id, head, sub, onCancel }: { id: string; head: string; sub: string; onCancel?: () => void }) {
  return (
    <div className="rounded-[18px] bg-charcoal text-white overflow-hidden hn-in">
      <div className="px-4 py-2.5 bg-sf-red flex justify-between font-mono font-bold text-[12px]">
        <span>REQUEST SENT</span>
        <span>{id}</span>
      </div>
      <div className="px-4 py-[18px] flex flex-col gap-2">
        <span className="font-display font-black text-2xl leading-tight">{head}</span>
        <span className="text-sm text-petal leading-relaxed">{sub}</span>
        {onCancel && (
          <button onClick={onCancel} className="self-start h-[38px] px-3.5 rounded-full border border-grey bg-transparent text-white font-bold text-[13px] cursor-pointer">
            Cancel request
          </button>
        )}
      </div>
    </div>
  );
}
