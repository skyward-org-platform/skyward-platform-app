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

export const WRITE_SINGLE_TOOLS: ToolDef[] = [
  {
    name: "set_wqa_action",
    description:
      "Set the operator-override action on ONE URL. Use Action7: Optimize, Restore, Redirect, Consolidate, Remove, Keep, Investigate.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" }, action: { type: "string" } },
      required: ["url", "action"],
    },
    category: "single-write",
  },
  {
    name: "set_wqa_status",
    description: "Set status on ONE URL. Values: Open, In Progress, Done.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" }, status: { type: "string" } },
      required: ["url", "status"],
    },
    category: "single-write",
  },
  {
    name: "set_wqa_target_url",
    description: "Set redirect destination URL on ONE source URL.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" }, target_url: { type: "string" } },
      required: ["url", "target_url"],
    },
    category: "single-write",
  },
  {
    name: "set_wqa_logic_notes",
    description: "Set free-text logic notes on ONE URL.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" }, notes: { type: "string" } },
      required: ["url", "notes"],
    },
    category: "single-write",
  },
  {
    name: "update_brand_field",
    description:
      "Update a single field on a Brand DNA section. section is the enum key, field is the JSON key inside content, value is the new value.",
    input_schema: {
      type: "object",
      properties: {
        section: { type: "string" },
        field: { type: "string" },
        value: {},
      },
      required: ["section", "field", "value"],
    },
    category: "single-write",
  },
  {
    name: "add_competitor",
    description: "Add a single competitor. priority: high|medium|low.",
    input_schema: {
      type: "object",
      properties: {
        domain: { type: "string" },
        priority: { type: "string" },
        notes: { type: "string" },
      },
      required: ["domain", "priority"],
    },
    category: "single-write",
  },
  {
    name: "remove_competitor",
    description: "Remove a competitor by domain.",
    input_schema: {
      type: "object",
      properties: { domain: { type: "string" } },
      required: ["domain"],
    },
    category: "single-write",
  },
  {
    name: "add_seed_keyword",
    description:
      "Add ONE seed keyword. priority: high|medium|low; intent: informational|commercial|transactional|navigational.",
    input_schema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        category: { type: "string" },
        seed_category: { type: "string" },
        intent: { type: "string" },
        priority: { type: "string" },
      },
      required: ["keyword"],
    },
    category: "single-write",
  },
  {
    name: "remove_seed_keyword",
    description: "Remove ONE seed keyword by its exact keyword string.",
    input_schema: {
      type: "object",
      properties: { keyword: { type: "string" } },
      required: ["keyword"],
    },
    category: "single-write",
  },
  {
    name: "add_brain_entry",
    description:
      "Add a Project Brain entry capturing knowledge from the conversation. type: issue|working|research|preference|strategy|insight. confidence: 0.0-1.0.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["type", "title", "body"],
    },
    category: "single-write",
  },
  {
    name: "update_mission",
    description: "Overwrite the property's strategic mission body.",
    input_schema: {
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"],
    },
    category: "single-write",
  },
];

export const BULK_TOOLS: ToolDef[] = [
  {
    name: "bulk_set_wqa_action",
    description:
      "Set action on MULTIPLE URLs. Generates an Apply card the operator clicks to confirm. Use when the operator wants to change ≥2 URLs at once.",
    input_schema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" } },
        action: { type: "string" },
        reason: {
          type: "string",
          description: "One-line justification shown in the proposal card",
        },
      },
      required: ["urls", "action", "reason"],
    },
    category: "bulk-write",
  },
  {
    name: "bulk_set_wqa_status",
    description: "Set status on MULTIPLE URLs. Generates an Apply card.",
    input_schema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" } },
        status: { type: "string" },
        reason: { type: "string" },
      },
      required: ["urls", "status", "reason"],
    },
    category: "bulk-write",
  },
  {
    name: "bulk_clear_action_override",
    description:
      "Revert N URLs back to the pipeline-derived action by deleting their wqa_decision rows. Apply card required.",
    input_schema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" } },
        reason: { type: "string" },
      },
      required: ["urls", "reason"],
    },
    category: "bulk-write",
  },
  {
    name: "bulk_add_seed_keywords",
    description:
      "Add N seed keywords at once. items: array of {keyword, category?, seed_category?, intent?, priority?}.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keyword: { type: "string" },
              category: { type: "string" },
              seed_category: { type: "string" },
              intent: { type: "string" },
              priority: { type: "string" },
            },
            required: ["keyword"],
          },
        },
        reason: { type: "string" },
      },
      required: ["items", "reason"],
    },
    category: "bulk-write",
  },
  {
    name: "bulk_add_competitors",
    description:
      "Add N competitors at once. items: array of {domain, priority, notes?}.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              domain: { type: "string" },
              priority: { type: "string" },
              notes: { type: "string" },
            },
            required: ["domain", "priority"],
          },
        },
        reason: { type: "string" },
      },
      required: ["items", "reason"],
    },
    category: "bulk-write",
  },
  {
    name: "approve_phase",
    description:
      "Approve a phase gate (0-6). Downstream phases will start consuming this phase's data. Generates an Apply card because the effect propagates.",
    input_schema: {
      type: "object",
      properties: {
        phase: { type: "number", description: "0-6" },
        reason: { type: "string" },
      },
      required: ["phase", "reason"],
    },
    category: "bulk-write",
  },
];

export const ALL_TOOLS: ToolDef[] = [
  ...READ_TOOLS,
  ...WRITE_SINGLE_TOOLS,
  ...BULK_TOOLS,
];
