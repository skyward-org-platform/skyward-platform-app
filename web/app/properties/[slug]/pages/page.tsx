import { supabase } from "@/lib/supabase";

const ACTION_COLORS: Record<string, string> = {
  optimize: "bg-blue-100 text-blue-700",
  restore: "bg-emerald-100 text-emerald-700",
  redirect: "bg-amber-100 text-amber-800",
  consolidate: "bg-slate-200 text-slate-700",
  remove: "bg-red-100 text-red-700",
  keep: "bg-slate-100 text-slate-600",
  no_action: "bg-slate-100 text-slate-500",
  undecided: "bg-yellow-100 text-yellow-800",
};

type Page = {
  url: string;
  page_type: string | null;
  status_code: number | null;
  audit_action: string | null;
  word_count: number | null;
};

async function getPages(slug: string): Promise<Page[]> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return [];
  const { data } = await supabase
    .from("page")
    .select("url, page_type, status_code, audit_action, word_count")
    .eq("property_id", prop.id)
    .order("audit_action", { ascending: true });
  return (data ?? []) as Page[];
}

export default async function PagesTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pages = await getPages(slug);

  if (pages.length === 0) {
    return (
      <div className="p-8 text-slate-500">No pages found for this property.</div>
    );
  }

  return (
    <div className="p-8">
      <div className="text-xs text-slate-500 mb-3">{pages.length} pages</div>
      <div className="border rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
            <tr>
              <th className="text-left px-3 py-2">URL</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Audit Action</th>
              <th className="text-right px-3 py-2">Words</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p, i) => (
              <tr key={i} className="border-t hover:bg-slate-50">
                <td
                  className="px-3 py-2 font-mono text-xs truncate max-w-md"
                  title={p.url}
                >
                  {p.url}
                </td>
                <td className="px-3 py-2 text-slate-600">{p.page_type ?? "—"}</td>
                <td className="px-3 py-2">{p.status_code ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                      ACTION_COLORS[p.audit_action ?? ""] ?? "bg-slate-100"
                    }`}
                  >
                    {p.audit_action ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {p.word_count ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
