/**
 * SmileTel Brand Style Guide
 * A living reference for colours, typography, components, and usage patterns.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, AlertTriangle, XCircle, Info, Copy } from "lucide-react";
import { useState } from "react";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663446026794/SkibUwiSvPndpvTSJv52KC/Smile-Tel_6584ae7f.webp";
const LOGO_PNG_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663446026794/SkibUwiSvPndpvTSJv52KC/SmileTelLogo_0a90e14c.png";
const ANIMATION_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663446026794/SkibUwiSvPndpvTSJv52KC/SmileTelAnimation_Black_Short_67d0d95f.mp4";

// ── Colour swatch component ───────────────────────────────────────────────────
function Swatch({ hex, name, role, textClass = "text-foreground" }: {
  hex: string; name: string; role: string; textClass?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={copy}
        className="w-full h-20 rounded-lg border border-border flex items-end justify-end p-2 transition-transform hover:scale-105 group"
        style={{ background: hex }}
        title={`Copy ${hex}`}
      >
        <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: hex === "#ffffff" || hex === "#c6cacd" ? "#000" : "#fff" }} />
      </button>
      <div>
        <p className={`text-sm font-semibold ${textClass}`}>{name}</p>
        <p className="text-xs text-muted-foreground font-mono">{hex}</p>
        <p className="text-xs text-muted-foreground">{role}</p>
        {copied && <p className="text-xs text-primary font-medium">Copied!</p>}
      </div>
    </div>
  );
}

// ── Typography sample ─────────────────────────────────────────────────────────
function TypeSample({ label, className, text }: { label: string; className: string; text: string }) {
  return (
    <div className="flex items-baseline gap-6 py-3 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground w-40 shrink-0 font-mono">{label}</span>
      <span className={className}>{text}</span>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        <div className="mt-3 h-0.5 w-12 rounded-full" style={{ background: "oklch(0.578 0.178 38.5)" }} />
      </div>
      {children}
    </section>
  );
}

export default function StyleGuide() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero header ── */}
      <div
        className="px-10 py-12 border-b border-border"
        style={{ background: "oklch(0.10 0 0)" }}
      >
        <div className="max-w-5xl mx-auto">
          <img src={LOGO_URL} alt="SmileTel" className="h-12 w-auto mb-6" style={{ filter: "brightness(0) invert(1)" }} />
          <h1 className="text-3xl font-bold text-white mb-2">Brand Style Guide</h1>
          <p className="text-sm" style={{ color: "oklch(0.55 0 0)" }}>
            The definitive reference for SmileTel's visual identity within the Billing Reconciliation platform.
            All colours, typography, components, and usage patterns are documented here.
          </p>
          <div className="flex gap-3 mt-6">
            <span className="text-xs font-mono px-3 py-1 rounded-full border" style={{ borderColor: "oklch(0.578 0.178 38.5)", color: "oklch(0.578 0.178 38.5)" }}>
              Version 1.0
            </span>
            <span className="text-xs font-mono px-3 py-1 rounded-full border" style={{ borderColor: "oklch(0.3 0 0)", color: "oklch(0.5 0 0)" }}>
              March 2026
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-10 py-10">

        {/* ── 1. Brand Colours ── */}
        <Section
          title="1. Brand Colours"
          subtitle="The SmileTel palette. Click any swatch to copy the hex value."
        >
          <div className="grid grid-cols-5 gap-6">
            <Swatch hex="#000000" name="Jet Black" role="Sidebar, headings, strong contrast" />
            <Swatch hex="#e95b2a" name="Brand Orange" role="Primary actions, active states, CTAs" />
            <Swatch hex="#c6cacd" name="Light Grey" role="Borders, dividers, input strokes" textClass="text-foreground" />
            <Swatch hex="#787879" name="Mid Grey" role="Secondary text, muted labels" textClass="text-foreground" />
            <Swatch hex="#ffffff" name="White" role="Page backgrounds, card surfaces" textClass="text-foreground" />
          </div>

          <div className="mt-8 grid grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm">Semantic Colours</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { name: "Success", bg: "oklch(0.56 0.15 145)", label: "Active, matched, healthy" },
                  { name: "Warning", bg: "oklch(0.72 0.16 75)", label: "Review, pending, caution" },
                  { name: "Danger", bg: "oklch(0.55 0.22 25)", label: "Flagged, error, destructive" },
                  { name: "Info", bg: "oklch(0.56 0.15 230)", label: "Informational, neutral notice" },
                ].map(({ name, bg, label }) => (
                  <div key={name} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md shrink-0" style={{ background: bg }} />
                    <div>
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Colour Usage Rules</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>• <strong className="text-foreground">Orange</strong> is reserved for primary actions, active navigation, and key data highlights. Never use it for body text.</p>
                <p>• <strong className="text-foreground">Black</strong> is the sidebar background and primary heading colour. Avoid on light backgrounds at small sizes.</p>
                <p>• <strong className="text-foreground">Mid Grey (#787879)</strong> is the standard secondary text colour — use for labels, captions, and supporting copy.</p>
                <p>• <strong className="text-foreground">Light Grey (#c6cacd)</strong> is for borders, dividers, and input outlines only — never for text.</p>
                <p>• <strong className="text-foreground">White</strong> is the default page and card background. Maintain sufficient contrast (4.5:1 minimum) for all text.</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ── 2. Typography ── */}
        <Section
          title="2. Typography"
          subtitle="Inter for UI text. JetBrains Mono for data, IDs, and code."
        >
          <Card>
            <CardContent className="pt-6">
              <TypeSample label="Display / H1 — 30px 700" className="text-3xl font-bold" text="SmileTel Billing Recon" />
              <TypeSample label="H2 — 24px 600" className="text-2xl font-semibold" text="Revenue & Margin Analysis" />
              <TypeSample label="H3 — 20px 600" className="text-xl font-semibold" text="Customer Service Summary" />
              <TypeSample label="H4 — 16px 600" className="text-base font-semibold" text="Monthly Cost Breakdown" />
              <TypeSample label="Body — 14px 400" className="text-sm" text="All services are reconciled against supplier invoices on a monthly basis." />
              <TypeSample label="Small / Caption — 12px 400" className="text-xs text-muted-foreground" text="Last synced 2 minutes ago · 2,928 services across 77 locations" />
              <TypeSample label="Mono / Data — 13px 400" className="data-value" text="AVC000232064930 · 157.211.8.165 · S0748" />
              <TypeSample label="Label — 10px 600 UPPERCASE" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" text="Service Attributes · Provider · Monthly Cost" />
            </CardContent>
          </Card>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Font Stack</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">UI / Body</span>
                  <span className="font-mono text-xs">Inter, system-ui, sans-serif</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data / Code</span>
                  <span className="font-mono text-xs">JetBrains Mono, ui-monospace</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Weight Scale</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {[["400", "Regular — body, captions"], ["500", "Medium — nav labels, table cells"], ["600", "Semibold — headings, card titles"], ["700", "Bold — display, stat numbers"]].map(([w, desc]) => (
                  <div key={w} className="flex gap-3">
                    <span className="font-mono text-xs text-muted-foreground w-8">{w}</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ── 3. Logo ── */}
        <Section
          title="3. Logo"
          subtitle="The SmileTel wordmark. Use the correct version for each background."
        >
          <div className="grid grid-cols-3 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">On White</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center py-8 bg-white rounded-lg border">
                <img src={LOGO_PNG_URL} alt="SmileTel on white" className="h-12 w-auto" />
              </CardContent>
              <p className="text-xs text-muted-foreground px-4 pb-4">Default — use on white or light grey backgrounds.</p>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">On Black (inverted)</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center py-8 rounded-lg" style={{ background: "#000" }}>
                <img src={LOGO_URL} alt="SmileTel on black" className="h-12 w-auto" style={{ filter: "brightness(0) invert(1)" }} />
              </CardContent>
              <p className="text-xs text-muted-foreground px-4 pb-4">Sidebar & dark backgrounds — CSS filter: brightness(0) invert(1).</p>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Animated (MP4)</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center py-4 rounded-lg bg-white border">
                <video
                  src={ANIMATION_URL}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="h-16 w-auto"
                />
              </CardContent>
              <p className="text-xs text-muted-foreground px-4 pb-4">Use for loading screens and splash pages only.</p>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader><CardTitle className="text-sm">Logo Usage Rules</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <p className="text-foreground font-medium mb-2">✓ Do</p>
                <ul className="space-y-1">
                  <li>• Maintain clear space equal to the cap-height of "S" on all sides</li>
                  <li>• Use the full-colour version on white/light backgrounds</li>
                  <li>• Use the white-inverted version on dark/black backgrounds</li>
                  <li>• Scale proportionally — never stretch or squish</li>
                </ul>
              </div>
              <div>
                <p className="text-foreground font-medium mb-2">✗ Don't</p>
                <ul className="space-y-1">
                  <li>• Don't change the orange colour of "tel"</li>
                  <li>• Don't place on busy photographic backgrounds</li>
                  <li>• Don't use below 24px height (illegible)</li>
                  <li>• Don't add drop shadows, outlines, or effects</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* ── 4. Buttons ── */}
        <Section
          title="4. Buttons"
          subtitle="Button hierarchy — use the appropriate variant for the action's importance."
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4 items-center mb-6">
                <div className="flex flex-col items-start gap-1">
                  <Button style={{ background: "oklch(0.578 0.178 38.5)", color: "#fff" }} className="hover:opacity-90">
                    Primary Action
                  </Button>
                  <span className="text-xs text-muted-foreground">Primary — brand orange</span>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <Button variant="secondary">Secondary</Button>
                  <span className="text-xs text-muted-foreground">Secondary — grey surface</span>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <Button variant="outline">Outline</Button>
                  <span className="text-xs text-muted-foreground">Outline — bordered</span>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <Button variant="ghost">Ghost</Button>
                  <span className="text-xs text-muted-foreground">Ghost — minimal</span>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <Button variant="destructive">Destructive</Button>
                  <span className="text-xs text-muted-foreground">Destructive — danger red</span>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <Button disabled>Disabled</Button>
                  <span className="text-xs text-muted-foreground">Disabled state</span>
                </div>
              </div>
              <Separator />
              <div className="flex flex-wrap gap-4 items-center mt-6">
                <Button size="sm" style={{ background: "oklch(0.578 0.178 38.5)", color: "#fff" }}>Small</Button>
                <Button size="default" style={{ background: "oklch(0.578 0.178 38.5)", color: "#fff" }}>Default</Button>
                <Button size="lg" style={{ background: "oklch(0.578 0.178 38.5)", color: "#fff" }}>Large</Button>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* ── 5. Badges & Status ── */}
        <Section
          title="5. Badges & Status Indicators"
          subtitle="Use consistently across the platform for service states, match confidence, and alerts."
        >
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm">Badges</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Badge style={{ background: "oklch(0.578 0.178 38.5)", color: "#fff" }}>Brand Orange</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge style={{ background: "oklch(0.56 0.15 145 / 0.15)", color: "oklch(0.46 0.15 145)", border: "1px solid oklch(0.56 0.15 145 / 0.3)" }}>Active</Badge>
                <Badge style={{ background: "oklch(0.72 0.16 75 / 0.15)", color: "oklch(0.55 0.16 75)", border: "1px solid oklch(0.72 0.16 75 / 0.3)" }}>Review</Badge>
                <Badge style={{ background: "oklch(0.55 0.22 25 / 0.15)", color: "oklch(0.5 0.22 25)", border: "1px solid oklch(0.55 0.22 25 / 0.3)" }}>Flagged</Badge>
                <Badge style={{ background: "oklch(0.56 0.15 230 / 0.15)", color: "oklch(0.46 0.15 230)", border: "1px solid oklch(0.56 0.15 230 / 0.3)" }}>Info</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Status Indicators</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" style={{ color: "oklch(0.56 0.15 145)" }} />
                  <span className="text-sm">Active & Matched</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" style={{ color: "oklch(0.72 0.16 75)" }} />
                  <span className="text-sm">Requires Review</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4" style={{ color: "oklch(0.55 0.22 25)" }} />
                  <span className="text-sm">Flagged / Error</span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4" style={{ color: "oklch(0.56 0.15 230)" }} />
                  <span className="text-sm">Informational</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: "oklch(0.578 0.178 38.5)" }} />
                  <span className="text-sm">Brand Accent Dot</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ── 6. Form Elements ── */}
        <Section
          title="6. Form Elements"
          subtitle="Inputs, selects, and form controls. Orange focus ring on all interactive elements."
        >
          <Card>
            <CardContent className="pt-6 space-y-4 max-w-md">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Text Input</label>
                <Input placeholder="e.g. AVC000232064930" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Input with value</label>
                <Input defaultValue="NICKI'S PROFESSIONAL SECURITY SCREENS" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Disabled</label>
                <Input placeholder="Read-only field" disabled />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Search</label>
                <div className="relative">
                  <Input placeholder="Search customers or services..." className="pl-8" />
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* ── 7. Cards ── */}
        <Section
          title="7. Cards & Surfaces"
          subtitle="Card hierarchy for data display, stats, and content grouping."
        >
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Standard Card</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">2,928</p>
                <p className="text-sm text-muted-foreground mt-1">Total Services</p>
              </CardContent>
            </Card>
            <Card className="border-l-4" style={{ borderLeftColor: "oklch(0.578 0.178 38.5)" }}>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Accent Border Card</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: "oklch(0.578 0.178 38.5)" }}>$88,749</p>
                <p className="text-sm text-muted-foreground mt-1">Monthly Spend</p>
              </CardContent>
            </Card>
            <Card style={{ background: "oklch(0.578 0.178 38.5)", color: "#fff", border: "none" }}>
              <CardHeader>
                <CardTitle className="text-sm text-white/70 uppercase tracking-wider">Brand Fill Card</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">86%</p>
                <p className="text-sm text-white/70 mt-1">Match Rate</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ── 8. Spacing & Grid ── */}
        <Section
          title="8. Spacing & Grid"
          subtitle="Consistent spacing scale based on a 4px base unit."
        >
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {[
                  ["4px", "0.25rem", "xs — icon gaps, tight labels"],
                  ["8px", "0.5rem", "sm — compact padding, badge internal"],
                  ["12px", "0.75rem", "md — nav item padding, input padding"],
                  ["16px", "1rem", "base — card padding, section gaps"],
                  ["24px", "1.5rem", "lg — card header, form group spacing"],
                  ["32px", "2rem", "xl — section separation"],
                  ["48px", "3rem", "2xl — page section breaks"],
                  ["64px", "4rem", "3xl — hero / page header padding"],
                ].map(([px, rem, desc]) => (
                  <div key={px} className="flex items-center gap-4">
                    <div className="w-16 text-xs font-mono text-muted-foreground">{px}</div>
                    <div className="w-16 text-xs font-mono text-muted-foreground">{rem}</div>
                    <div
                      className="rounded"
                      style={{
                        width: px,
                        height: "16px",
                        background: "oklch(0.578 0.178 38.5)",
                        minWidth: px,
                      }}
                    />
                    <div className="text-sm text-muted-foreground">{desc}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* ── 9. Data Display ── */}
        <Section
          title="9. Data Display Patterns"
          subtitle="Consistent patterns for displaying telecom service data throughout the platform."
        >
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm">Service Attribute Row</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  ["PROVIDER", "ABB"],
                  ["SUPPLIER", "ABB"],
                  ["SERVICE TYPE", "Fibre"],
                  ["PLAN", "Wholesale NBN 250Mbps/100Mbps"],
                  ["AVC / CONN ID", "AVC000232064930"],
                  ["IP ADDRESS", "157.211.8.165"],
                  ["MONTHLY COST", "$78.00"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-start py-1.5 border-b border-border last:border-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                    <span className="text-sm text-right font-medium">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Margin Highlight</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg" style={{ background: "oklch(0.578 0.178 38.5 / 0.08)", border: "1px solid oklch(0.578 0.178 38.5 / 0.2)" }}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Margin</p>
                  <p className="text-2xl font-bold" style={{ color: "oklch(0.578 0.178 38.5)" }}>52.0%</p>
                  <p className="text-xs text-muted-foreground mt-1">$84.50 revenue — $40.50 cost</p>
                </div>
                <div className="p-4 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Monthly Revenue</p>
                  <p className="text-2xl font-bold">$162.50</p>
                </div>
                <div className="p-4 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Monthly Cost</p>
                  <p className="text-2xl font-bold">$78.00</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ── 10. Voice & Tone ── */}
        <Section
          title="10. Voice & Tone"
          subtitle="How SmileTel communicates within the platform."
        >
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm">Writing Principles</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p><strong className="text-foreground">Clear over clever.</strong> Use plain language. "Service not matched" beats "Reconciliation anomaly detected."</p>
                <p><strong className="text-foreground">Specific over vague.</strong> "3 services flagged for termination" beats "Some services need attention."</p>
                <p><strong className="text-foreground">Active over passive.</strong> "Sync now" beats "Synchronisation can be initiated."</p>
                <p><strong className="text-foreground">Numbers in context.</strong> Always show currency with $ and units (Mbps, GB, months).</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Label Conventions</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  ["Section headers", "ALL CAPS, 10px, tracked"],
                  ["Table column headers", "ALL CAPS, 10px, tracked"],
                  ["Form labels", "ALL CAPS, 10px, tracked"],
                  ["Button text", "Title Case, 14px, semibold"],
                  ["Nav items", "Title Case, 13px, medium"],
                  ["Data values", "JetBrains Mono, 13px"],
                  ["Currency", "$ prefix, 2 decimal places"],
                  ["Percentages", "1 decimal place, % suffix"],
                ].map(([item, rule]) => (
                  <div key={item} className="flex justify-between py-1 border-b border-border last:border-0">
                    <span className="text-muted-foreground">{item}</span>
                    <span className="font-medium text-xs">{rule}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ── Footer ── */}
        <div className="mt-12 pt-8 border-t border-border text-center">
          <img src={LOGO_PNG_URL} alt="SmileTel" className="h-8 w-auto mx-auto mb-3 opacity-30" />
          <p className="text-xs text-muted-foreground">
            SmileTel Brand Style Guide v1.0 · March 2026 · Internal use only
          </p>
        </div>

      </div>
    </div>
  );
}
