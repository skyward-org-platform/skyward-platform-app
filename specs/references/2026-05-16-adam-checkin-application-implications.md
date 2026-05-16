---
date: 2026-05-16
source: Zoom — May 15 check-in with Adam (https://fathom.video/share/9hUoNYFbTtxZWAP7shR-ZDU_-ck1LFsU)
purpose: Pull what's load-bearing for the v2 application out of the conversation.
---

# May 15 Adam check-in — application implications

The conversation was loose but it locked in several things that change how we build. Sorting them by what affects the application most.

## 1. The hierarchy needs to expand: property → profiles

This is the biggest single change from the conversation.

Today we model `client → property → page` with property = a domain (+ optional additional_domains array). The conversation surfaced that a property is really a **brand operating across many surfaces** — and those surfaces aren't all websites:

> "you could have like the Google My Business property, you could have the Bing, you can have like all these sort of additional associations, right? All of the social, social profiles, right? Like all of that could be housed within that one property."
>
> "a client could have more than one property, and each of those properties could have more than one profile, or website, or whatever — not website, but domain and social profiles, and Google My Business profile, etc."

So the real hierarchy is:

```
client
 └── property[]                    brand + the operational unit
      ├── domain[]                 websites associated with the brand
      ├── gbp_listing              Google Business Profile
      ├── bing_listing             Bing Places
      ├── social_profile[]         IG, FB, TikTok, LinkedIn, X, YouTube
      └── (others as they come)
```

**v2 UI implication:** property header today shows `primary_domain + url_prefix`. To represent the new model, that header eventually surfaces a small profile-strip — domain badge plus icons for any active profiles (GBP, IG, etc.) with hover-to-show URLs. Brand DNA Site Structure tab (placeholder today) probably becomes broader, covering all profile types.

**Schema implication:** the current `property.primary_domain` + `additional_domains[]` columns don't cover this. Eventually we want a separate `profile` table keyed on property_id, with type enum (`domain`, `gbp`, `bing`, `instagram`, `facebook`, etc.) and a URL or identifier per row. Hold this until Adam's back; don't migrate yet.

## 2. The "domain status" problem

Adam pointed out that in his BQ Meta model, `domain` does double duty:
- A domain we have an active engagement on (= our `property`)
- A domain just linked to a client for tracking (competitor, sister brand, parked)

> "It's almost like a status of a domain."

In our Supabase model the active-engagement domains are explicit `property` rows, while the rest live in BQ Meta `client_domains` rows we don't materialize. So we already implicitly have this distinction — we just don't surface "all the domains the client owns, only some of which are active properties" anywhere.

**v2 UI implication:** the client detail page used to show "Owned domains" as a flat list. That treatment was right — it surfaces every domain a client owns, with the "active property" subset highlighted (e.g. a chip "→ property"). The conversation lightly pushed back on the framing ("Are these owned domains or properties?") — but the answer is **both, with status**. Owned domains is the superset; properties are the subset we're actively working on.

## 3. Adam's SEO pipeline package is landing — UI wiring becomes the next move

The pipeline modules are being repackaged as a real Python package with a state-machine pattern:

> "everything that I'm building in the SEO pipeline package is built in a way where you have... each of these modules and they're like a state machine. The way the state machine works is that it has all the logic for the module that you're running. And then all you would do is connect your input and your output to it. So it's basically going to be taking in a structured input and outputting a structured output for every step."
>
> "you would just plug in those inputs and outputs into your UI. Like right now, I'm connecting them into like the terminal, but you would just connect them into your UI."

**WQA + KGA are ready to plug in.** The package + Loom + integration pointers will land before he leaves for Iceland (action item, his side).

**v2 UI implication — this is now the highest-leverage build-mode work:**

- The Pages tab gets a "Run WQA" affordance that maps to the WQA module's structured inputs (domain, optional time range, optional caps).
- The Keywords tab gets a "Run KGA" affordance similarly — picker for competitors, time range, etc.
- Each run shows progress while it executes (mirrors the Research & Fill pipeline pattern we already mocked on the Brand DNA Overview).
- Results land in the standard property tabs.

This is what the Project Brain entries from the v2 mockup will fill with — outputs from these runs.

## 4. Content pipeline gets a concrete UX pattern: PAA + Reddit + keyword target

Paul drew the line during the conversation:

> "when we're creating an article or a landing page, we're going to want to take our keyword target, go out to wherever we're pulling data from, ask for the people also ask questions, pull it into our thing... maybe we even ask Reddit. Ask Reddit and say, what are people talking about on this topic? And bring those in too."

So the Content tab (a Tier-1 gap from yesterday's analysis) has a concrete brief-generation pattern:

```
Pick keyword target → fetch PAA questions  ─┐
                  └→ fetch Reddit threads  ─┼→ aggregate into content brief
                  └→ pull Brand DNA voice  ─┤
                  └→ pull Personas         ─┘
```

The PAA layer is straightforward (DataForSEO has it). Reddit is "more exploratory" — pull threads/posts on the topic, surface common questions, let strategist pick which to include.

**v2 UI implication:** when we build the Content tab, the brief-creation surface is the anchor screen. Looks similar to the Research & Fill card pattern: pick target, hit Generate, watch the pipeline run, get a draft brief at the end. Don't need to build this yet — just hold the pattern.

## 5. Supabase migration is locked in

> Paul: "I heard like your major point was, you're really okay with migrating things into Supabase."
>
> Adam: "Yeah."

Plus the speed observation:

> "[BigQuery is] great for storing like large data, but it's just like for that quick snappy stuff that you just want. Like it's, it's the worst for it."

**v2 UI implication:** the no-duplication rule we've been holding (don't mirror BQ Meta data into Supabase) was the right call for the prototype phase. When Adam's back, we do the full reconciliation:
- BQ Meta clients / domains / projects → Supabase
- skyward-common gets adjusted to read from Supabase
- The hierarchy expansion (property → profiles) can land at the same time
- Real-time UI gets meaningfully faster

This is a "when Adam returns" item, not pre-trip.

## 6. Pipeline phases will dissolve over time

> Paul: "the pipeline is like a mechanism for workflow, where we are, okay we've done this part of it... but in some way, I think it all could end up being like, here's, you know, we've done the, it could all basically be defined at once, all the pipelines at once."
>
> Adam: "it's still going to have some sort of progress bar, where I'm assuming there's going to be a couple like human checkpoints to review things, but the phase will start to dissolve away a little bit."

**v2 UI implication:** the labeled phase strip (Onboard → WQA → Tech SEO → Keywords → Content → Authority → Tracking) is right for today. Long-term, it morphs into **checkpoints, not waterfalls** — runs happen in parallel and the strip becomes a state indicator across each parallel track. Don't redesign yet; the current phase strip is fine. Just don't over-invest in the linear story.

## 7. ClickUp scope shrinks — the platform IS the work surface

> Adam (relaying Cristina): "ClickUp could just be for actual project management, like just to make sure people are getting tasks done, but then the actual work can get done on like a platform app like this."
>
> Paul: "Maybe I don't have to use ClickUp anymore."

**v2 UI implication:** validates the v2 mockup's emphasis on Project Brain, Priorities, Guidelines as work-surface tabs. ClickUp stays for human task assignment + status; the actual artifacts (Brand DNA, audits, briefs, decisions, signals) live in our app. The Project Brain mockup we just designed is exactly the right pattern for "decisions and preferences this team has made about this client" — captures what ClickUp comments can't.

## 8. Project vs. service naming — deferred

> Paul: "Maybe I'll just call mine service. And you call yours... Reykjavik."
>
> Adam: "I think for right now, we could still just call it project, we could figure that out later."

**v2 UI implication:** no rename needed yet. Project entity stays. The 3 project types (`seo`, `paid_search`, `paid_social`) play the "service" role implicitly. Revisit if we end up needing both concepts (a "service" the client buys + a "project" run that delivers it).

## 9. Brand DNA pattern was the right read

> Paul: "I'm so glad we are calling it Skyward Platform because it's not, it can be more than just an SEO platform."

And later:

> Paul: "the brand DNA stuff is great, you know, I just love the brand DNA stuff because it really does sort of, I mean, I feel like it's sort of what you were doing in your own capacity."
>
> Adam: "exactly where it's like, like you're saying before, like we've been doing things in parallel, but this is sort of where we have a finalized version that we could use for both of them."

Brand DNA is now the agreed-upon **client-level instruction store** that both sides converge on. Adam's BQ Meta "client background" / "global client instructions" pattern → Brand DNA in our app. When the migration happens, his store flows in.

**v2 UI implication:** keep building Brand DNA out (next moves were Personas, Seed Keywords, Skyward Score, Data Access surfacing from the P0 gap analysis). This is the canonical pattern, not just our take on it.

## 10. The conversation also confirmed the v2 mockup direction broadly

> Paul: "Claude code really hit on a nice design for me. I felt like it was the most, it was the best design work I've seen Claude do for us so far."
>
> Paul: "Looks a lot like some of the other tools we're using these days too, like Peek and Vercel."
>
> Adam: "I mean, it looks pretty good."

Lock in v2 as the direction. Continue iterating; don't restart.

---

## Action items from the call

| Owner | Item |
|---|---|
| Adam | Publish Skyward SEO pipeline package before leaving |
| Adam | Record Loom: how to use WQA + KGA locally + integration pointers |
| Adam | Send Paul the hierarchy doc (client/domain/project + property concept overlap) |
| Paul | Send Adam PAA + Reddit examples (Keyword Insights as the reference) |
| Adam | Set up Reddit monitors for Kitchen Guard + Dental Shop (in flight) |
| Adam | Coordinate with Nikhil on per-client LLM classifier prompt refinement (in flight) |

## What this changes about the v2 mockup, ranked

1. **Property = profiles** (domain + GBP + Bing + social). Property hero needs eventual profile-strip treatment. (Deferred — schema reconciliation when Adam's back.)
2. **Pages + Keywords tabs need run-affordances** wired to Adam's WQA + KGA modules. (Build mode, blocked on package landing.)
3. **Content tab UX pattern** (PAA + Reddit + keyword target → brief) is now concrete. (Still a Tier-1 gap from yesterday — design later.)
4. **Brand DNA is canonical client-instruction store** — keep building, no second-guessing. (Continue.)
5. **Pipeline phase strip stays for now**, with awareness it'll soften toward checkpoints. (No change.)
6. **Project / service naming stays as "project"** for now. (No change.)

## Open framework questions

These came up but weren't resolved:

- How do we surface "domains owned by client" vs "properties we're actively working on" — same list with a chip, or two separate sections?
- When property gets profiles (GBP, social), where do those profiles' Brand DNA live? Inherited from property, or per-profile?
- For paid_search projects on a property whose primary surface is social (e.g. paid social ads driving traffic to an IG profile, not the website), what's the property URL? Maybe properties without `primary_domain` exist?

Park these until the schema reconciliation conversation with Adam post-Iceland.
