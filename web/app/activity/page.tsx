// /activity — v2 screen 10. Cross-property chronological audit trail.
//
// Server-fetches up to 100 events across three sources (Brand DNA edits,
// page audit decisions, Project Brain entries). Hands off to the client
// timeline component for filtering + density bucketing.

import { getActivityFeed } from "@/lib/activity";
import { ActivityTimeline } from "@/components/ActivityTimeline";

export default async function ActivityPage() {
  const items = await getActivityFeed({ limit: 100, perSource: 50 });
  return <ActivityTimeline items={items} />;
}
