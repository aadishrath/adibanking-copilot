// Client-side checks always bypass HTTP caches; this token is scoped by the server session.
export async function fetchBankingRevision(signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/banking/revision', { cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Could not check for banking changes.');
  if (typeof result.revision !== 'string' || !result.revision) throw new Error('The server returned an invalid banking revision.');
  return result.revision;
}
