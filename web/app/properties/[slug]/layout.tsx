import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

async function getProperty(slug: string) {
  const { data } = await supabase
    .from("property")
    .select("id, slug, name, primary_domain, url_prefix, pipeline_phase, client:client_id(name, slug)")
    .eq("slug", slug)
    .single();
  return data;
}

export default async function PropertyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prop = await getProperty(slug);
  if (!prop) notFound();

  const tabs = [
    { href: `/properties/${slug}`, label: "Brand DNA" },
    { href: `/properties/${slug}/pages`, label: "Pages" },
    { href: `/properties/${slug}/projects`, label: "Projects" },
  ];

  const client = prop.client as unknown as { name: string; slug: string } | null;
  const domainDisplay = `${prop.primary_domain}${prop.url_prefix ?? ""}`;

  return (
    <div>
      <div className="border-b px-8 py-4 flex items-end justify-between">
        <div>
          <div className="text-xs text-slate-500">{client?.name}</div>
          <h1 className="text-xl font-bold">{prop.name}</h1>
          <div className="text-xs text-slate-500">{domainDisplay}</div>
        </div>
        <div className="text-xs">
          <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-semibold">
            Phase {prop.pipeline_phase}
          </span>
        </div>
      </div>
      <div className="border-b px-8 flex gap-6 text-sm">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="py-3 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-400">
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
