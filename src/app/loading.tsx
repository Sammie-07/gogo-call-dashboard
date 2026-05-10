export default function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center space-y-2">
        <div className="text-lg font-medium">Pulling data from GoHighLevel…</div>
        <div className="text-sm text-zinc-500">First load can take up to a minute. Subsequent refreshes are instant.</div>
      </div>
    </main>
  );
}
