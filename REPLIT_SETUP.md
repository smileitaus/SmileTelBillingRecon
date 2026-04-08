# Replit Setup Guide — SmileTel Billing Reconciliation Platform

> This guide is specifically for developers setting up the Lucid platform on Replit. Read the main `README.md` for full architecture context before starting.

---

## Quick Start (15 minutes)

### 1. Import the Repository

In Replit, click **Create Repl** > **Import from GitHub** and enter:

```
smileitaus/SmileTelBillingRecon
```

Select **Node.js** as the language. Replit will detect the `package.json` automatically.

### 2. Set Up a Database

The application requires a **MySQL-compatible** database. The recommended options for Replit are:

**Option A — TiDB Cloud Serverless (recommended, free tier available)**

1. Go to [tidbcloud.com](https://tidbcloud.com) and create a free Serverless cluster.
2. Copy the connection string from the TiDB Cloud console. It will look like:
   ```
   mysql://user:password@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/smiletelrecon?ssl={"rejectUnauthorized":true}
   ```
3. Add this as `DATABASE_URL` in Replit Secrets.

**Option B — PlanetScale**

1. Create a free database at [planetscale.com](https://planetscale.com).
2. Copy the connection string and add as `DATABASE_URL`.

**Option C — Replit PostgreSQL (requires schema adaptation)**

Replit provides built-in PostgreSQL. However, the Drizzle schema uses MySQL-specific types (`mysqlTable`, `varchar`, `decimal`). To use PostgreSQL, you must adapt the schema in `drizzle/schema.ts` to use `pgTable` equivalents. This is a significant change — Option A or B is strongly recommended.

### 3. Install Dependencies

Open the Replit Shell and run:

```bash
npm install -g pnpm
pnpm install
```

### 4. Add Required Secrets

In the Replit **Secrets** tab (padlock icon), add the following minimum set to get the application running:

| Secret Key | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Your MySQL connection string | From step 2 above |
| `JWT_SECRET` | Any random 32+ character string | e.g., `openssl rand -hex 32` |
| `VITE_APP_ID` | `dev` | Placeholder for local dev |
| `OAUTH_SERVER_URL` | `https://api.manus.im` | Manus OAuth server |
| `VITE_OAUTH_PORTAL_URL` | `https://manus.im` | Manus login portal |
| `OWNER_OPEN_ID` | `dev-user` | Placeholder for local dev |
| `OWNER_NAME` | `Developer` | Your name |

For full supplier API functionality, add all secrets listed in `README.md` Section 12.

### 5. Apply the Database Schema

```bash
pnpm drizzle-kit push
```

This creates all 65+ tables in your database. If you see errors about existing tables, run:

```bash
pnpm drizzle-kit push --force
```

### 6. Seed Initial Data

```bash
node seed-db.mjs
```

This populates:
- Supplier registry (10 suppliers)
- Access4 Diamond pricebook (204 products)
- SasBoss product cost map (52 products)
- Initial billing periods

### 7. Start the Application

```bash
pnpm dev
```

The application will be available at the Replit preview URL on port 3000.

---

## Authentication on Replit

The application uses **Manus OAuth** for authentication. On Replit, you have two options:

### Option A — Use Manus OAuth (requires Manus account)

If you have a Manus account, the OAuth flow will work as-is. The callback URL must be registered with Manus. Contact the SmileIT team for a development OAuth client ID registered for your Replit domain.

### Option B — Bypass Auth for Development (quick start)

For rapid development without OAuth, you can temporarily hardcode a development user. Edit `server/_core/context.ts`:

```typescript
// Find the section that reads the JWT cookie and replace with:
export async function createContext({ req, res }: CreateExpressContextOptions) {
  // Development bypass — remove before production
  const devUser = {
    openId: 'dev-user',
    name: 'Developer',
    email: 'dev@smileit.com.au',
    role: 'admin' as const,
  };
  return { req, res, user: devUser };
}
```

**Important:** Remove this bypass before any production deployment.

---

## Platform Differences — Manus vs Replit

The following Manus-specific features require adaptation on Replit:

### File Storage (S3)

Manus provides managed S3 storage. On Replit, replace the helpers in `server/storage.ts` with one of:

- **Cloudflare R2** — S3-compatible, generous free tier. Add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` to secrets.
- **AWS S3** — Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME` to secrets.
- **Replit Object Storage** — Available via `@replit/object-storage` npm package.

The `storagePut` and `storageGet` functions in `server/storage.ts` are the only touch points — swap the implementation without changing the function signatures and the rest of the application will work unchanged.

### LLM Integration

The `invokeLLM` helper in `server/_core/llm.ts` uses Manus built-in API keys. On Replit, replace with a direct API call:

```typescript
// Replace the invokeLLM implementation with:
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function invokeLLM({ messages }) {
  return client.chat.completions.create({
    model: 'gpt-4o',
    messages,
  });
}
```

Add `OPENAI_API_KEY` to Replit Secrets.

### Email (SendGrid)

SendGrid integration is already implemented and works identically on Replit. Add `SendGrid_API` to Replit Secrets.

### Owner Notifications

The `notifyOwner` helper sends notifications via the Manus notification API. On Replit, this will silently fail (returns `false`) unless you replace the implementation with an email or webhook notification. The application handles `false` returns gracefully.

---

## Running Tests

```bash
pnpm test
```

All 20+ test files should pass. If database-dependent tests fail, ensure `DATABASE_URL` is set correctly and the schema has been applied.

To run a specific test file:

```bash
pnpm test server/starlink.test.ts
```

---

## Deployment on Replit

To deploy on Replit:

1. Click **Deploy** in the Replit header.
2. Select **Autoscale** deployment.
3. Set the run command to `pnpm start` (which runs `node dist/server/index.js` after build).
4. Ensure all production secrets are set in the Replit Secrets tab.
5. The application will be available at `https://<repl-name>.<username>.repl.co`.

**Note:** Manus provides built-in hosting with custom domain support as an alternative to Replit deployment. If you are considering external hosting, the Manus platform may be simpler to manage for this application.

---

## Getting Production Data

The production database is hosted on Manus-managed TiDB. To get a copy of production data for development:

1. Contact the SmileIT team for a database export.
2. Import the SQL dump into your development database:
   ```bash
   mysql -h <host> -u <user> -p <database> < production_dump.sql
   ```

**Important:** The production database contains customer PII (names, addresses, phone numbers). Handle with appropriate care and do not commit any data exports to the repository.

---

## Troubleshooting

**"Cannot connect to database"** — Check that `DATABASE_URL` is correctly formatted and the database server is accessible from Replit. TiDB Cloud requires SSL; ensure the connection string includes `?ssl={"rejectUnauthorized":true}`.

**"JWT_SECRET is not set"** — Add `JWT_SECRET` to Replit Secrets. Any random string of 32+ characters will work for development.

**"ECONNRESET on scheduled sync"** — The Carbon API and Omada scheduled syncs will fail if the supplier credentials are not set. This is expected in development — add the relevant secrets to enable these syncs.

**"pnpm: command not found"** — Run `npm install -g pnpm` first.

**Vite build errors** — Ensure Node.js version is 22 or higher. Check Replit's language settings.

---

*For questions, contact angusbs@smiletel.com.au or open an issue on the GitHub repository.*
