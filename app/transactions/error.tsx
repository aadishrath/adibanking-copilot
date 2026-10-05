'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <div role="alert" className="rounded-xl bg-red-50 p-6 text-red-700"><p>Transactions are unavailable. Please try again.</p><button className="mt-3 underline" onClick={reset}>Retry</button></div>; }
