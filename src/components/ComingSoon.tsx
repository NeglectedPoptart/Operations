export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-black/50 dark:text-white/50">Coming soon.</p>
    </div>
  );
}
