# Team Authentication Implementation Guide

**For:** Replit developers replicating the Lucid Billing Reconciliation platform  
**Auth system:** `TEAM_ACCESS_PASSWORD` shared password + optional Manus OAuth  
**Status in Manus build:** Fully implemented and production-tested

---

## Overview

The Lucid platform uses a **dual-mode authentication** system. Users can sign in via either:

1. **Team Password login** — a shared password stored as `TEAM_ACCESS_PASSWORD`. Any team member enters their name, email address, and the shared password. The server creates (or upserts) a user record and issues a session cookie. This is the primary method used by the SmileTel billing team.
2. **Manus OAuth** — the platform owner's single-sign-on via Manus. This is only relevant on the Manus-hosted build; Replit should treat this as a secondary or disabled option.

The entire application is wrapped in an `<AuthGate>` component. Unauthenticated users see a login screen; authenticated users see the full dashboard. There are no public routes.

---

## Required Secret

Add one environment variable to Replit Secrets:

| Key | Value | Notes |
|---|---|---|
| `TEAM_ACCESS_PASSWORD` | The shared team password | Ask Angus for the current value |

---

## Backend Implementation

### 1. Environment variable exposure (`server/_core/env.ts`)

Add `teamAccessPassword` to the `ENV` object:

```ts
export const ENV = {
  // ... existing vars ...
  teamAccessPassword: process.env.TEAM_ACCESS_PASSWORD ?? "",
};
```

### 2. Team login endpoint (`server/_core/index.ts` or `server/index.ts`)

Register a `POST /api/team-login` Express route **before** the tRPC middleware. This endpoint validates the shared password, upserts a user record, and sets a session cookie.

```ts
import multer from "multer";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { upsertUser } from "./db";

app.post("/api/team-login", async (req, res) => {
  try {
    const { password, name, email } = req.body;

    // Guard: secret must be configured
    if (!ENV.teamAccessPassword) {
      return res.status(500).json({ error: "Team access not configured" });
    }

    // Validate password
    if (password !== ENV.teamAccessPassword) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Derive a deterministic openId from the email so the same person
    // always gets the same user record regardless of which device they use.
    const teamOpenId = `team_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;

    // Upsert the user (creates on first login, updates lastSignedIn on repeat)
    await upsertUser({
      openId: teamOpenId,
      name: name || email.split("@")[0],
      email: email,
      loginMethod: "team_password",
      lastSignedIn: new Date(),
    });

    // Issue a session token (1-year expiry — this is an internal tool)
    const token = await sdk.createSessionToken(teamOpenId, {
      expiresInMs: ONE_YEAR_MS,
      name: name || email.split("@")[0],
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, token, {
      ...cookieOptions,
      maxAge: ONE_YEAR_MS,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("[Team Login] Error:", error);
    return res.status(500).json({ error: "Login failed" });
  }
});
```

**Key points:**
- The `teamOpenId` prefix `team_` distinguishes team-password users from Manus OAuth users in the `users` table.
- `upsertUser` should use `INSERT ... ON DUPLICATE KEY UPDATE` (MySQL) or equivalent so repeated logins update `lastSignedIn` without creating duplicate rows.
- The session cookie is `httpOnly`, `sameSite: "lax"`, and `secure` in production. The `getSessionCookieOptions` helper handles this automatically.
- `ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000` — defined in `shared/const.ts`.

### 3. Database schema (`drizzle/schema.ts`)

The `users` table must include a `loginMethod` column to distinguish auth sources:

```ts
export const users = mysqlTable("users", {
  id:            int("id").primaryKey().autoincrement(),
  openId:        varchar("openId", { length: 128 }).notNull().unique(),
  name:          varchar("name", { length: 256 }),
  email:         varchar("email", { length: 256 }),
  role:          mysqlEnum("role", ["admin", "user"]).default("user"),
  loginMethod:   varchar("loginMethod", { length: 64 }),  // "team_password" | "manus_oauth"
  lastSignedIn:  datetime("lastSignedIn"),
  createdAt:     datetime("createdAt").default(sql`CURRENT_TIMESTAMP`),
});
```

If the column does not exist yet, run the migration:

```sql
ALTER TABLE users ADD COLUMN loginMethod VARCHAR(64) NULL;
```

---

## Frontend Implementation

### 1. `TeamLoginForm` component

This is a standalone React component that lives at the top of `client/src/App.tsx` (or can be extracted to `client/src/components/TeamLoginForm.tsx`).

```tsx
import { useState } from "react";
import { Lock, Mail, User as UserIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function TeamLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/team-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      onSuccess();
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      {/* Name field */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Your Name
        </label>
        <div className="relative">
          <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Angus Burnett-Smith"
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring transition-all placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Email field */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Email Address
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@smileit.com.au"
            required
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring transition-all placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Password field */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Team Password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter shared team password"
            required
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring transition-all placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full" size="lg">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Signing in...
          </>
        ) : (
          "Sign in with Team Password"
        )}
      </Button>
    </form>
  );
}
```

### 2. `AuthGate` component

Wrap the entire app in `AuthGate`. Unauthenticated users see the login screen; authenticated users see the app.

```tsx
import { useAuth } from "@/contexts/AuthContext"; // or however auth state is exposed
import { getLoginUrl } from "@/const";            // Manus OAuth helper

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [loginMode, setLoginMode] = useState<"choose" | "team">("choose");
  const utils = trpc.useUtils();

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated — show login screen
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          {/* Header */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-center">
              Billing Reconciliation Tool
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Sign in to access the SmileTel billing reconciliation dashboard.
              This tool contains sensitive billing data and requires authentication.
            </p>
          </div>

          {loginMode === "choose" ? (
            <div className="w-full space-y-3">
              {/* Primary: Team password */}
              <Button
                onClick={() => setLoginMode("team")}
                size="lg"
                className="w-full"
              >
                <Lock className="w-4 h-4 mr-2" />
                Sign in with Team Password
              </Button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
              </div>

              {/* Secondary: Manus OAuth (can be hidden on Replit) */}
              <Button
                variant="outline"
                onClick={() => { window.location.href = getLoginUrl(); }}
                size="lg"
                className="w-full"
              >
                Sign in with Manus Account
              </Button>
            </div>
          ) : (
            <div className="w-full">
              <TeamLoginForm
                onSuccess={() => {
                  utils.auth.me.invalidate();
                  window.location.reload();
                }}
              />
              <button
                onClick={() => setLoginMode("choose")}
                className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
              >
                ← Back to login options
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Authenticated — render the app
  return <>{children}</>;
}
```

### 3. Wire `AuthGate` into `App.tsx`

```tsx
export default function App() {
  return (
    <AuthGate>
      {/* All your routes go here */}
      <Router>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            {/* ... */}
          </Switch>
        </Layout>
      </Router>
    </AuthGate>
  );
}
```

---

## How It Works End-to-End

The flow from login to authenticated session works as follows:

1. User visits the app → `AuthGate` calls `trpc.auth.me.useQuery()` → returns `null` (no cookie) → login screen is shown.
2. User enters name, email, and the shared team password → `TeamLoginForm` POSTs to `/api/team-login`.
3. Server validates `password === ENV.teamAccessPassword`. If correct, it derives `teamOpenId = "team_" + sanitised(email)` and upserts a row in the `users` table.
4. Server calls `sdk.createSessionToken(teamOpenId, ...)` to mint a signed JWT, then sets it as an `httpOnly` cookie named `COOKIE_NAME` (defined in `shared/const.ts`).
5. `onSuccess()` fires → `utils.auth.me.invalidate()` re-fetches the current user → `trpc.auth.me` now returns the user object → `AuthGate` renders the app.
6. On subsequent page loads, the cookie is sent automatically → `sdk.authenticateRequest(req)` validates it → `ctx.user` is populated → all `protectedProcedure` calls succeed.

---

## Replit-Specific Notes

### Disable Manus OAuth on Replit

The "Sign in with Manus Account" button calls `getLoginUrl()` which redirects to `VITE_OAUTH_PORTAL_URL`. On Replit this will fail because the Manus OAuth server does not know about the Replit domain. Two options:

**Option A — Hide the button entirely** (recommended for Replit):
```tsx
// In AuthGate, replace the "or / Manus Account" section with:
{/* Manus OAuth not available on this deployment */}
```

**Option B — Keep the button but show a tooltip:**
```tsx
<Button variant="outline" disabled title="Manus OAuth not available on this deployment" size="lg" className="w-full opacity-50">
  Sign in with Manus Account (Manus-hosted only)
</Button>
```

### Dev bypass for local development

During development, if you want to skip the login screen entirely, add this to the top of `createContext` in `server/_core/context.ts`:

```ts
// DEV BYPASS — remove before production
if (process.env.NODE_ENV !== "production") {
  return {
    req: opts.req,
    res: opts.res,
    user: {
      id: 1,
      openId: "dev_bypass",
      name: "Dev User",
      email: "dev@smileit.com.au",
      role: "admin",
      loginMethod: "dev_bypass",
      lastSignedIn: new Date(),
      createdAt: new Date(),
    },
  };
}
```

Remove this block before deploying to production.

### Session cookie on Replit

Replit serves the frontend and backend from the same domain (e.g., `your-app.replit.app`), so `sameSite: "lax"` and `secure: true` will work correctly. No special cookie configuration is needed beyond what `getSessionCookieOptions` already provides.

---

## Vitest Test

The following test is already in the Manus build at `server/team-login.test.ts`. Add it to Replit to verify the secret is wired correctly:

```ts
import { describe, expect, it } from "vitest";

describe("team-login", () => {
  it("TEAM_ACCESS_PASSWORD environment variable is set", () => {
    const password = process.env.TEAM_ACCESS_PASSWORD;
    expect(typeof password).toBe("string");
    expect(password!.length).toBeGreaterThan(0);
  });

  it("ENV object exposes teamAccessPassword", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV).toHaveProperty("teamAccessPassword");
    expect(typeof ENV.teamAccessPassword).toBe("string");
    expect(ENV.teamAccessPassword.length).toBeGreaterThan(0);
  });
});
```

Run with: `pnpm test`

---

## Checklist

- [ ] `TEAM_ACCESS_PASSWORD` added to Replit Secrets
- [ ] `teamAccessPassword: process.env.TEAM_ACCESS_PASSWORD ?? ""` added to `ENV` in `server/_core/env.ts`
- [ ] `POST /api/team-login` route registered in the Express server (before tRPC middleware)
- [ ] `loginMethod` column exists in the `users` table (run migration if needed)
- [ ] `TeamLoginForm` component implemented in `client/src/App.tsx`
- [ ] `AuthGate` component wraps the entire app in `App.tsx`
- [ ] Manus OAuth button hidden or disabled (not functional on Replit)
- [ ] Dev bypass removed from `createContext` before production deployment
- [ ] Vitest test passes: `pnpm test`
