import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Mail, User as UserIcon } from "lucide-react";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import CustomerList from "./pages/CustomerList";
import CustomerDetail from "./pages/CustomerDetail";
import ServiceDetail from "./pages/ServiceDetail";
import UnmatchedServices from "./pages/UnmatchedServices";
import RevenueMargin from "./pages/RevenueMargin";
import BillingUnmatched from "./pages/BillingUnmatched";
import CustomerMerge from "./pages/CustomerMerge";
import Review from "./pages/Review";
import AutoMatch from "./pages/AutoMatch";
import BillingPlatformChecks from "./pages/BillingPlatformChecks";
import ServiceBillingMatch from "./pages/ServiceBillingMatch";
import SupplierInvoices from "./pages/SupplierInvoices";
import CustomerWorkbookMatching from "./pages/CustomerWorkbookMatching";
import CustomerBillingMatch from "./pages/CustomerBillingMatch";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

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
            placeholder="e.g. Kim Wilson"
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring transition-all placeholder:text-muted-foreground/50"
          />
        </div>
      </div>
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

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [loginMode, setLoginMode] = useState<"choose" | "team">("choose");
  const utils = trpc.useUtils();

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

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-center">
              Billing Reconciliation Tool
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Sign in to access the Telstra billing reconciliation dashboard.
              This tool contains sensitive billing data and requires authentication.
            </p>
          </div>

          {loginMode === "choose" ? (
            <div className="w-full space-y-3">
              <Button
                onClick={() => setLoginMode("team")}
                size="lg"
                className="w-full"
              >
                <Lock className="w-4 h-4 mr-2" />
                Sign in with Team Password
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = getLoginUrl();
                }}
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
                Back to login options
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function Router() {
  return (
    <AuthGate>
      <Layout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/customers" component={CustomerList} />
          <Route path="/customers/:id" component={CustomerDetail} />
          <Route path="/services/:id" component={ServiceDetail} />
          <Route path="/unmatched" component={UnmatchedServices} />
          <Route path="/revenue" component={RevenueMargin} />
          <Route path="/billing" component={BillingUnmatched} />
          <Route path="/review" component={Review} />
          <Route path="/merge" component={CustomerMerge} />
          <Route path="/auto-match" component={AutoMatch} />
          <Route path="/platform-checks" component={BillingPlatformChecks} />
          <Route path="/service-billing-match" component={ServiceBillingMatch} />
          <Route path="/supplier-invoices" component={SupplierInvoices} />
          <Route path="/customers/:customerId/match-workbook" component={CustomerWorkbookMatching} />
          <Route path="/customers/:id/billing-match" component={CustomerBillingMatch} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </AuthGate>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
