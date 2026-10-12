import { NextResponse } from "next/server";
import { investigate } from "@/lib/agent";

export async function POST() {
  try {
    const result = await investigate();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Investigation failed:", err);
    return NextResponse.json(
      { error: err?.message || "Investigation failed" },
      { status: 500 },
    );
  }
}
