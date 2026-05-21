import { hasWriteToken } from "@/lib/auth";
import { signIn, signOut } from "./actions";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const signedIn = await hasWriteToken();
  const { error, next } = await searchParams;

  return (
    <div className="p-12 max-w-md">
      <h1 className="text-2xl font-bold mb-2">Sign in</h1>
      <p className="text-sm text-slate-500 mb-6">
        Enter the access token to view client data and edit Brand DNA + Pages.
      </p>

      {signedIn ? (
        <form action={signOut} className="space-y-4">
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
            Signed in.
          </div>
          <button
            type="submit"
            className="text-xs text-slate-600 underline hover:text-slate-900"
          >
            Sign out
          </button>
        </form>
      ) : (
        <form action={signIn} className="space-y-3">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
          <label className="block text-xs font-medium text-slate-700">
            Access token
            <input
              type="password"
              name="token"
              autoComplete="current-password"
              required
              autoFocus
              className="mt-1 w-full text-sm border border-slate-300 rounded px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </label>
          {next && <input type="hidden" name="next" value={next} />}
          <button
            type="submit"
            className="text-sm font-semibold bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-700"
          >
            Sign in
          </button>
        </form>
      )}
    </div>
  );
}
