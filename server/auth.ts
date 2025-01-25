import { type Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { type SelectUser } from "@db/schema"; //Preserving original import


// For demonstration only — you can store users in a DB, or do something else
// in your success callback below.
const USERS_DB = new Map<string, any>(); // e.g. key by profile.id, store user object

// You'll need actual client ID and secret from your Google OAuth credentials.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "YOUR_GOOGLE_CLIENT_SECRET";

// Minimal user type
type User = {
  id: string;
  email?: string;
  displayName?: string;
};

// Add to the Express "request user" definition (if needed)
declare global {
  namespace Express {
    interface User extends User, SelectUser {} // Combining original and new User types
  }
}

export function setupAuth(app: Express) {
  // MemoryStore for the session
  const MemoryStore = createMemoryStore(session);

  // Basic session -  Retaining parts of original session setup
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "porygon-supremacy",
    resave: false,
    saveUninitialized: false,
    cookie: {},
    store: new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie = {
      secure: true,
    };
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure Google OAuth Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        // Example: store user in "DB"
        let user: User = {
          id: profile.id,
          email: profile.emails?.[0]?.value,
          displayName: profile.displayName,
        };
        USERS_DB.set(profile.id, user);
        done(null, user);
      }
    )
  );

  // Serialize: store user.id in session
  passport.serializeUser((user: User, done) => {
    done(null, user.id);
  });

  // Deserialize: fetch from your "DB"
  passport.deserializeUser((id: string, done) => {
    const user = USERS_DB.get(id);
    if (!user) return done(new Error("User not found"));
    done(null, user);
  });

  // Simple route: start OAuth
  app.get("/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  // OAuth callback route
  app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/auth/fail" }),
    (req: Request, res: Response) => {
      // If successful, redirect wherever you want
      res.redirect("/details"); // e.g. your details page
    }
  );

  // If user not authenticated
  app.get("/auth/fail", (req, res) => {
    res.send("Failed to authenticate with Google.");
  });

  // Logout route - Retaining logout functionality from original
  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ message: "Logout successful" });
    });
  });

  //Retaining user info route from original
  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      return res.json(req.user);
    }

    res.status(401).send("Not logged in");
  });
}

// Helper to protect routes with OAuth
export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  return res.status(401).send("You must log in with Google first.");
}