// Brand DNA sub-layout — fetches the counts the subnav strip needs, then
// hands off to the client subnav component (it needs usePathname()).
//
// Per v2-screens.md screen 5: subnav appears below the main tabstrip on
// muted/40 surface. Active item gets an elevated white pill with ring.
//
// All three reads (sections, property meta, chat history) come from the
// cached helpers in lib/brand-dna-data + lib/property — every sub-page
// navigation shares the same in-flight data.

import {
  BRAND_DNA_SUBNAV,
  countItemsInContent,
} from "@/lib/brand-dna-subnav";
import { BrandDnaSubnav } from "@/components/BrandDnaSubnav";
import { BrandDnaAssistantDrawer } from "@/components/BrandDnaAssistantDrawer";
import { getPropertyBySlug } from "@/lib/property";
import { getAllSections, getCachedChatHistory } from "@/lib/brand-dna-data";

function buildCounts(
  sections: Awaited<ReturnType<typeof getAllSections>>,
): Record<string, number | null> {
  const bySection = new Map<string, Record<string, unknown> | null>();
  for (const row of sections) bySection.set(row.section, row.content);
  const counts: Record<string, number | null> = {};
  for (const item of BRAND_DNA_SUBNAV) {
    if (!item.countable) continue;
    counts[item.slug] = item.section
      ? countItemsInContent(bySection.get(item.section))
      : null;
  }
  return counts;
}

export default async function BrandDnaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const baseRoute = `/properties/${slug}/brand-dna`;
  const [prop, sections, chatHistory] = await Promise.all([
    getPropertyBySlug(slug),
    getAllSections(slug),
    getCachedChatHistory(slug),
  ]);
  const counts = buildCounts(sections);
  const name = prop?.name ?? slug;
  const hasContent = sections.length > 0;

  return (
    <div>
      <BrandDnaSubnav baseRoute={baseRoute} counts={counts} />
      {children}
      {/* Section-scoped chat drawer. Self-suppresses on the Overview route
          (where the chat is embedded as the hero). Section pages get a
          floating "Ask about <section>" button bottom-right. */}
      <BrandDnaAssistantDrawer
        propertySlug={slug}
        propertyName={name}
        hasContent={hasContent}
        initialMessages={chatHistory}
      />
    </div>
  );
}
