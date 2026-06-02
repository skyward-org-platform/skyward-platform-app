// Local SEO data layer. One GBP profile per property. GMB data comes from
// the Python API (DataForSEO for unconnected profiles, Jepto BQ for
// connected ones). Degrades to null when data is absent.
import { apiBase } from "./api-base";

export type GmbPerformance = {
  search_impressions: number | null; maps_impressions: number | null;
  calls: number | null; web_clicks: number | null;
  directions: number | null; bookings: number | null;
};
export type GmbReview = { rating: number | null; comment: string | null; reply: string | null; reviewer: string | null; date: string | null };
export type GmbQna = { question: string | null; answer: string | null };
export type GmbPost = { summary: string | null; cta: string | null; date: string | null };
export type GmbLocation = {
  name: string; source: "jepto" | "dataforseo" | "none"; primary_geo: string | null;
  primary_category: string | null; additional_categories: string[] | null;
  phone: string | null; address: string | null; website: string | null;
  hours: string | null; attributes: string | null; photo_count: number | null;
  rating: number | null; review_count: number | null;
  performance: GmbPerformance | null; reviews: GmbReview[]; qna: GmbQna[]; posts: GmbPost[];
};

export async function getGmbData(slug: string): Promise<GmbLocation | null> {
  try {
    const res = await fetch(`${apiBase()}/api/properties/${slug}/gmb`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return (j && j.location) ? (j.location as GmbLocation) : null;
  } catch {
    return null;
  }
}
