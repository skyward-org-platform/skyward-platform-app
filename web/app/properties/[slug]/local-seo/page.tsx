import { getGmbData } from "@/lib/local-seo";
import { ProfilePanel, PerformancePanel, ReviewsPanel, QnAPanel, PostsPanel } from "@/components/local-seo/panels";

export default async function LocalSeoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loc = await getGmbData(slug);
  if (!loc) {
    return <div className="p-8 text-sm text-muted-foreground">No Google Business Profile is linked to this property yet.</div>;
  }
  const badge = loc.source === "jepto" ? "Jepto connected" : loc.source === "dataforseo" ? "via DataForSEO (public)" : "Not connected";
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{loc.name}</h1>
        <span className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground">{badge}</span>
      </div>
      <ProfilePanel loc={loc} />
      <PerformancePanel loc={loc} />
      <ReviewsPanel loc={loc} />
      <QnAPanel loc={loc} />
      <PostsPanel loc={loc} />
    </div>
  );
}
