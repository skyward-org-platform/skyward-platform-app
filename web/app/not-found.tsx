import Link from "next/link";

export default function NotFound() {
  return (
    <div className="p-12 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Not found.</h1>
      <p className="text-sm text-slate-600">
        The page you tried to open doesn&rsquo;t exist. Common cases: a property
        slug that&rsquo;s been renamed, a tab that hasn&rsquo;t been built yet, or
        a stale link.
      </p>
      <div className="mt-6 text-sm">
        <Link href="/" className="text-blue-600 hover:underline">
          ← Home
        </Link>
      </div>
    </div>
  );
}
