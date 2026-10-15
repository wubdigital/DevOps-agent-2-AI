<div dir="ltr">

# DevOps Agent AI — סוכן AI לחקירת תקלות

שירות הזמנות קטן (Express + MongoDB) עם תקלות שמפעילים דרך `SCENARIO`, וסוכן AI (Next.js + Groq) שחוקר אותו דרך כלים בלבד ומחזיר: **איזו תקלה זו, מה הראיות, ומה הצעד הבא.**
הכל רץ בקונטיינרים עם Docker Compose.

## ארכיטקטורה

```
┌───────────────────────────┐   HTTP    ┌────────────────────────────────────┐
│ service/  (port 4000)     │ ◄──────── │ web/  Next.js  (port 3000)         │
│ Express orders API        │   tools   │ 🔍 Investigator agent  (4 tools)   │
│ faults via SCENARIO       │           │ 🧑‍🚒 Responder agent    (no tools)  │
└─────────────┬─────────────┘           │ דף "חקור"                          │
              │                         └─────────────────┬──────────────────┘
              ▼                                           ▼
      MongoDB Atlas (orders)                        Groq API (LLM)
```

- **הסוכן לא רואה את הקוד ואת `SCENARIO`.** הוא לומד על השירות רק דרך HTTP, באמצעות הכלים.
- **אין סודות בקוד.** `MONGO_URL` ו-`GROQ_API_KEY` נשמרים רק בקבצי `.env.local`, שלא נכנסים ל-git ולא ל-Docker image.

## מבנה הפרויקט

```
DevOps-agent-2-AI/
├── docker-compose.yml        # מרים service + web
├── service/                  # השירות ("המטופל")
│   ├── server.js             # Express + MongoDB + תקלות
│   ├── Dockerfile
│   ├── .dockerignore
│   └── .env.example
└── web/                      # הסוכן + הממשק ("הרופא")
    ├── src/app/page.js                   # דף "חקור"
    ├── src/app/api/investigate/route.js  # API שמפעיל את הסוכנים
    ├── src/lib/agent.js                  # שני הסוכנים
    ├── src/lib/tools.js                  # הכלים
    ├── Dockerfile
    ├── .dockerignore
    └── .env.example
```

## תקלות (SCENARIO)

| SCENARIO        | מה קורה                                           | מה הסוכן אמור לזהות        |
| --------------- | ------------------------------------------------- | -------------------------- |
| `healthy`       | הכל תקין (ברירת מחדל)                             | `healthy`                  |
| `db_down`       | השירות מנסה להתחבר לשרת DB שלא קיים (`ENOTFOUND`) | `database_unavailable`     |
| `payment_down`  | ספק התשלומים החיצוני לא עונה (`ETIMEDOUT`)        | `external_dependency_down` |
| `slow_response` | זמני תגובה של 2.5–4 שניות, למרות ש-`/health` תקין | `performance_degradation`  |
| `bad_deploy`    | גרסה 1.1.0 עם באג (`TypeError`)                   | `bad_deployment`           |

## כלי הסוכן

| כלי             | מה הוא עושה                                                      |
| --------------- | ---------------------------------------------------------------- |
| `check_health`  | `GET /health`: סטטוס, מצב מסד הנתונים וספק התשלומים              |
| `check_version` | `GET /version`: הגרסה שרצה                                       |
| `probe_orders`  | שולח תעבורה אמיתית ל-`/api/orders` (GET + POST) ומודד זמני תגובה |
| `read_logs`     | `GET /logs`: הלוגים האחרונים של השירות                           |

## בונוס

- ✅ **זיהוי מצב תקין:** הסוכן מזהה גם מצב שבו הכל עובד, ולא ממציא בעיה.
- ✅ **שני סוכנים:**
  - 🔍 **סוכן חקירה** מפעיל את הכלים, אוסף ראיות ומסווג את התקלה.
  - 🧑‍🚒 **סוכן תגובה** לא מקבל כלים. הוא מקבל רק את הממצאים, קובע עדיפות (P1/P2/P3) ומחליט מה הצעד הבא.

## הרצה עם Docker (מומלץ)

**דרישות:** Docker, מפתח חינמי מ-[Groq](https://console.groq.com), ו-cluster ב-[MongoDB Atlas](https://www.mongodb.com/atlas). ב-Atlas צריך לאשר גישה ב-Network Access.

```bash
# 1. הגדרת סודות (לא נכנסים ל-git ולא ל-image)
cp service/.env.example service/.env.local   # להכניס MONGO_URL
cp web/.env.example web/.env.local           # להכניס GROQ_API_KEY

# 2. הרמת המערכת
docker compose up --build
```

פותחים את http://localhost:3000 ולוחצים **"חקור"**.

**הפעלת תקלה:**

```bash
SCENARIO=db_down docker compose up
```

**פקודות שימושיות:**
| פקודה | מה היא עושה |
|---|---|
| `docker compose up -d` | הרצה ברקע |
| `docker compose logs -f service` | מעקב אחרי הלוגים של השירות |
| `docker compose ps` | מה רץ |
| `docker compose down` | עצירה ומחיקה של הקונטיינרים |

### הערה על רשת

ב-GitHub Codespaces, רשתות שדוקר יוצר עבור compose לא מקבלות יציאה לאינטרנט, ולכן הקונטיינרים לא מגיעים ל-Atlas ול-Groq. לכן ב-`docker-compose.yml` מוגדר `network_mode: host`, והשירות זמין ל-web דרך `localhost:4000`.

בסביבה רגילה אפשר להשתמש ברשת הפרטית של compose. מורידים את `network_mode`, מוסיפים `ports`, ומגדירים `SERVICE_URL=http://service:4000`. ברשת הזו כל שירות זמין לפי השם שלו.

## הרצה בלי Docker (פיתוח)

```bash
# טרמינל 1 — השירות
cd service
npm install
SCENARIO=db_down npm run dev

# טרמינל 2 — הסוכן והממשק
cd web
npm install
npm run dev
```

## משתני סביבה

**`service/.env.local`**
| משתנה | תיאור |
|---|---|
| `MONGO_URL` | כתובת החיבור ל-MongoDB Atlas, כולל `/orders` |
| `PORT` | ברירת מחדל: 4000 |
| `SCENARIO` | ברירת מחדל: `healthy` |

**`web/.env.local`**
| משתנה | תיאור |
|---|---|
| `GROQ_API_KEY` | מפתח API של Groq |
| `MODEL` | ברירת מחדל: `openai/gpt-oss-120b` |
| `SERVICE_URL` | כתובת השירות. ברירת מחדל: `http://localhost:4000` |

## מודל

Groq, מודל `openai/gpt-oss-120b`, דרך `@openai/agents`. אפשר להחליף ספק (Gemini, OpenRouter, Ollama ועוד) על ידי שינוי ה-`baseURL` והמפתח ב-`web/src/lib/agent.js`.

</div>
