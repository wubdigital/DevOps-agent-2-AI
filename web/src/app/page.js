"use client";

import { useState } from "react";

// צבע ושם בעברית לכל סוג תקלה
const FAULTS = {
  healthy: {
    label: "תקין",
    color: "bg-green-100 text-green-800 border-green-300",
  },
  database_unavailable: {
    label: "מסד נתונים לא זמין",
    color: "bg-red-100 text-red-800 border-red-300",
  },
  external_dependency_down: {
    label: "תלות חיצונית נפלה",
    color: "bg-orange-100 text-orange-800 border-orange-300",
  },
  performance_degradation: {
    label: "ירידה בביצועים",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
  },
  bad_deployment: {
    label: "גרסה תקולה",
    color: "bg-purple-100 text-purple-800 border-purple-300",
  },
  unknown: {
    label: "לא ידוע",
    color: "bg-gray-100 text-gray-800 border-gray-300",
  },
};

const CONFIDENCE = { high: "גבוהה", medium: "בינונית", low: "נמוכה" };

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [seconds, setSeconds] = useState(null);

  async function handleInvestigate() {
    setLoading(true);
    setError(null);
    setResult(null);
    const start = Date.now();

    try {
      const res = await fetch("/api/investigate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSeconds(((Date.now() - start) / 1000).toFixed(1));
      setLoading(false);
    }
  }

  const report = result?.report;
  const fault = FAULTS[report?.faultType] || FAULTS.unknown;

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold">סוכן חקירת תקלות</h1>
        <p className="mt-1 text-slate-600">
          שני סוכנים: סוכן חקירה בודק את orders-service דרך הכלים שלו בלבד,
          וסוכן תגובה מחליט מה עושים.
        </p>

        <button
          onClick={handleInvestigate}
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-slate-900 px-6 py-3 text-lg font-semibold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "🔍 חוקר..." : "🔍 חקור"}
        </button>

        {error && (
          <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
            <strong>החקירה נכשלה:</strong> {error}
          </div>
        )}

        {report && (
          <section className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {/* תגית התקלה + ביטחון + זמן */}
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full border px-4 py-1 font-semibold ${fault.color}`}
              >
                {fault.label}
              </span>
              <span className="text-sm text-slate-500">
                ביטחון: {CONFIDENCE[report.confidence] || report.confidence} ·{" "}
                {seconds} שניות
              </span>
            </div>

            <p className="text-lg">{report.summary}</p>

            {/* סוכן 1: ראיות */}
            <div>
              <h2 className="mb-2 font-semibold">🔍 ראיות (סוכן החקירה)</h2>
              <ul className="list-disc space-y-1 pr-5 text-slate-700">
                {report.evidence?.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>

            {/* סוכן 2: החלטה */}
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="font-semibold">🧑‍🚒 החלטת סוכן התגובה</h2>
                {report.priority && report.priority !== "none" && (
                  <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                    {report.priority}
                  </span>
                )}
              </div>
              <p className="rounded-lg bg-slate-100 p-3 font-medium">
                {report.nextStep}
              </p>
              {report.reasoning && (
                <p className="mt-2 text-sm text-slate-600">
                  {report.reasoning}
                </p>
              )}
            </div>

            {/* הכלים שהסוכן הפעיל */}
            <div>
              <h2 className="mb-2 font-semibold">
                כלים שסוכן החקירה הפעיל (לפי הסדר)
              </h2>
              <div dir="ltr" className="flex flex-wrap gap-2">
                {result.toolsUsed?.map((name, i) => (
                  <code
                    key={i}
                    className="rounded bg-slate-100 px-2 py-1 text-sm"
                  >
                    {i + 1}. {name}
                  </code>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
