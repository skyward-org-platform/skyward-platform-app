import type { ToolDef } from "./types";

// Read tools - execute immediately, return JSON to the model so it
// can continue the turn with the data in context. None of these mutate.

export const READ_TOOLS: ToolDef[] = [
  {
    name: "read_property_meta",
    description:
      "Return property metadata: name, primary_domain, status, pipeline_phase, phase gate approvals, page counts (total, by action). Always call this once early in a conversation to ground subsequent decisions.",
    input_schema: { type: "object", properties: {} },
    category: "read",
  },
  {
    name: "read_wqa_urls",
    description:
      "Query the WQA pipeline output for URLs matching filter criteria. Filters: action ('Optimize'|'Restore'|'Redirect'|'Consolidate'|'Remove'|'Keep'|'Investigate'), status_code_min/max, min_sessions, min_impressions, min_backlinks, min_refdomains, has_backlinks (bool), is_indexable (bool), limit (default 100, max 500). Returns each URL with status_code, title, sessions, impressions, refdomains, backlinks, indexability.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string" },
        status_code_min: { type: "number" },
        status_code_max: { type: "number" },
        min_sessions: { type: "number" },
        min_impressions: { type: "number" },
        min_backlinks: { type: "number" },
        min_refdomains: { type: "number" },
        has_backlinks: { type: "boolean" },
        is_indexable: { type: "boolean" },
        limit: { type: "number" },
      },
    },
    category: "read",
  },
  {
    name: "read_wqa_decisions",
    description:
      "Operator overrides on wqa_decision. Filters: status ('Open'|'In Progress'|'Done'|'Drifted'), action.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string" },
        action: { type: "string" },
      },
    },
    category: "read",
  },
  {
    name: "read_brand_dna",
    description:
      "Brand DNA section content. If 'section' provided, returns that one section's content jsonb. If omitted, returns all sections with content lengths so the model can decide what to fetch in detail.",
    input_schema: {
      type: "object",
      properties: { section: { type: "string" } },
    },
    category: "read",
  },
  {
    name: "read_competitors",
    description: "All property_competitor rows for the property.",
    input_schema: { type: "object", properties: {} },
    category: "read",
  },
  {
    name: "read_seed_keywords",
    description:
      "All property_seed_keyword rows for the property. Optionally filtered by intent or priority.",
    input_schema: {
      type: "object",
      properties: {
        intent: { type: "string" },
        priority: { type: "string" },
      },
    },
    category: "read",
  },
  {
    name: "read_keyword_clusters",
    description:
      "Keyword cluster summary - cluster names + keyword counts per cluster.",
    input_schema: { type: "object", properties: {} },
    category: "read",
  },
  {
    name: "read_audit_docs",
    description: "audit_doc rows (link audits etc) for the property.",
    input_schema: { type: "object", properties: {} },
    category: "read",
  },
  {
    name: "read_page_embedding_match",
    description:
      "Cosine-similarity search for a source URL. Returns top-3 most semantically similar URLs in page_embedding for this property, with similarity scores. Used to suggest redirect destinations.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
    category: "read",
  },
  {
    name: "read_recent_activity",
    description:
      "Most recent N edits across brand_dna_section, wqa_decision, property_competitor, property_seed_keyword. Default limit 20.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
    category: "read",
  },
];

export const ALL_TOOLS: ToolDef[] = [...READ_TOOLS];
