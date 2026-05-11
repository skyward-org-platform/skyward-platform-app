import { supabase } from "@/lib/supabase";
import { AuditActionChip } from "@/components/AuditActionChip";

type Page = {
  id: string;
  url: string;
  page_type: string | null;
  status_code: number | null;
  audit_action: string | null;
  word_count: number | null;
};

async function getPages(slug: string): Promise<{ pages: Page[]; slug: string }> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return { pages: [], slug };
  const { data } = await supabase
    .from("page")
    .select("id, url, page_type, status_code, audit_action, word_count")
    .eq("property_id", prop.id)
    .order("audit_action", { ascending: true });
  return { pages: (data ?? []) as Page[], slug };
}

export default async function PagesTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { pages } = await getPages(slug);

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
            {pages.map((p) => (
              <tr key={p.id} className="border-t hover:bg-slate-50">
                <td
                  className="px-3 py-2 font-mono text-xs truncate max-w-md"
                  title={p.url}
                >
                  {p.url}
                </td>
                <td className="px-3 py-2 text-slate-600">{p.page_type ?? "—"}</td>
                <td className="px-3 py-2">{p.status_code ?? "—"}</td>
                <td className="px-3 py-2">
                  <AuditActionChip
                    pageId={p.id}
                    initialAction={p.audit_action}
                    propertySlug={slug}
                  />
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
