import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Team password login endpoint
  app.post("/api/team-login", async (req, res) => {
    try {
      const { password, name, email } = req.body;
      const { ENV: envVars } = await import("./env");
      const { sdk: sdkInstance } = await import("./sdk");
      const { getSessionCookieOptions } = await import("./cookies");
      const { COOKIE_NAME, ONE_YEAR_MS } = await import("../../shared/const");
      const dbModule = await import("../db");

      if (!envVars.teamAccessPassword) {
        return res.status(500).json({ error: "Team access not configured" });
      }

      if (password !== envVars.teamAccessPassword) {
        return res.status(401).json({ error: "Invalid password" });
      }

      // Create a team user with a deterministic openId based on email
      const teamOpenId = `team_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;

      await dbModule.upsertUser({
        openId: teamOpenId,
        name: name || email.split("@")[0],
        email: email,
        loginMethod: "team_password",
        lastSignedIn: new Date(),
      });

      // Create a session token
      const token = await sdkInstance.createSessionToken(teamOpenId, {
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

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
