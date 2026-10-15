# DevOps Agent AI — סוכן AI לחקירת תקלות

שירות הזמנות קטן (Express) עם תקלות שמפעילים דרך `SCENARIO`, וסוכן AI (Next.js + Groq) שחוקר אותו דרך כלים בלבד ומחזיר: איזו תקלה זו, מה הראיות, ומה הצעד הבא.

## ארכיטקטורה

```
┌──────────────────────┐   HTTP   ┌───────────────────────────────────┐
│ service/ (port 4000) │ ◄─────── │ web/ (Next.js, port 3000)         │
│ Express orders API   │  tools   │ 🔍 Investigator agent  (4 tools)  │
│ faults via SCENARIO  │          │ 🧑‍🚒 Responder agent    (no tools) │
└──────────────────────┘          │ דף "חקור"                         │
                                  └───────────────────────────────────┘
```

הסוכן לא רואה את הקוד ואת `SCENARIO`. הוא לומד על השירות רק דרך HTTP, דרך הכלים.

## תקלות (SCENARIO)

| SCENARIO        | מה קורה                                  |
| --------------- | ---------------------------------------- |
| `healthy`       | הכל תקין (ברירת מחדל)                    |
| `db_down`       | מסד הנתונים לא זמין (ECONNREFUSED)       |
| `payment_down`  | ספק התשלומים החיצוני לא עונה (ETIMEDOUT) |
| `slow_response` | זמני תגובה של 2.5–4 שניות                |
| `bad_deploy`    | גרסה 1.1.0 עם באג (TypeError)            |

## כלי הסוכן

| כלי             | מה הוא עושה                                     |
| --------------- | ----------------------------------------------- |
| `check_health`  | `GET /health`: סטטוס ומצב התלויות               |
| `check_version` | `GET /version`: הגרסה שרצה                      |
| `probe_orders`  | שולח תעבורה אמיתית ל-`/api/orders` (GET + POST) |
| `read_logs`     | `GET /logs`: הלוגים האחרונים                    |

## בונוס

- ✅ הסוכן מזהה גם מצב שבו הכל תקין.
- ✅ שני סוכנים: **סוכן חקירה** מפעיל כלים ואוסף ראיות, ו**סוכן תגובה** (בלי כלים) מקבל את הממצאים וקובע עדיפות (P1/P2/P3) וצעד הבא.

## הרצה

**דרישות:** Node.js 20 ומעלה, ומפתח חינמי מ-[Groq](https://console.groq.com).

```bash
# 1. השירות
cd service
npm install
SCENARIO=db_down npm run dev

# 2. הסוכן והממשק (בטרמינל נוסף)
cd web
npm install
cp .env.example .env.local   # ולהכניס את GROQ_API_KEY
npm run dev
```

פותחים את http://localhost:3000 ולוחצים **"חקור"**.

## מודל

Groq, מודל `openai/gpt-oss-120b`, דרך `@openai/agents`. אפשר להחליף ספק על ידי שינוי ה-`baseURL` והמפתח.
