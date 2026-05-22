// Next.js Route Handler: GET /properties/[slug]/authority/disavow.txt
//
// Generates the Google Search Console disavow file from the property's
// disavow_entry rows where status='In File' or 'Confirmed by GSC'. The
// underlying work (filter, sort, format) lives in the exportDisavowTxt
// server action so the same logic can be reused programmatically.
//
// Response sets Content-Disposition: attachment so the browser saves the
// file (named <slug>-disavow.txt) instead of rendering it inline.

import { NextResponse } from "next/server";
import { exportDisavowTxt } from "../actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const text = await exportDisavowTxt(slug);
  if (typeof text !== "string") {
    return NextResponse.json({ error: text.error }, { status: 404 });
  }
  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-disavow.txt"`,
    },
  });
}
