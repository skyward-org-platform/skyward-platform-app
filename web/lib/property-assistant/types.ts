// Shared types for the Property Assistant. The Anthropic SDK doesn't
// export a clean Tool type we can extend, so we keep our own that
// adapts at the route boundary.

export type ToolCategory = "read" | "single-write" | "bulk-write";

export type ToolDef = {
  name: string;
  description: string;
  /** JSON schema for input. Anthropic uses { type: 'object', properties, required }. */
  input_schema: Record<string, unknown>;
  /** Routing category - the route handler uses this to decide whether
   *  to execute immediately + return a tool_result, or to emit a
   *  proposal SSE event and stop the turn. */
  category: ToolCategory;
};

export type RouteContext = {
  /** Current operator location, e.g. '/properties/buscharter/pages?action=redirect' */
  pathname: string;
  search: string;
  /** Optional - the URL set the operator has selected (from bulk
   *  selection on the WQA tables). Lets the model say
   *  'I see you have 12 URLs selected; do you want me to do X with them?' */
  selectedUrls?: string[];
};

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export type ProposalPayload = {
  /** The tool name that generated this proposal - the dispatcher
   *  uses it to route the Apply click to the right server action. */
  tool: string;
  /** Original tool_use input the model emitted - the dispatcher
   *  feeds this back into the matching server action. */
  input: Record<string, unknown>;
  /** Human-readable summary the Apply card renders above the button.
   *  Built by the route handler when it intercepts a bulk tool call. */
  summary: string;
  /** Count of affected rows so the Apply button shows 'Apply (50)'. */
  count: number;
};
