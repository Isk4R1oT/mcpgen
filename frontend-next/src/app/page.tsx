"use client";

import Link from "next/link";
import {
  Upload,
  Settings2,
  Cpu,
  Container,
  Brain,
  ShieldCheck,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: Upload,
    label: "Upload",
    description: "Paste an OpenAPI/Swagger URL or upload a spec file",
  },
  {
    icon: Settings2,
    label: "Configure",
    description: "Select endpoints, set auth, customize tool names",
  },
  {
    icon: Cpu,
    label: "Generate",
    description: "AI analyzes your API and generates MCP server code",
  },
  {
    icon: Container,
    label: "Deploy",
    description: "Get a Docker image ready to run in any environment",
  },
];

const features = [
  {
    icon: Brain,
    title: "AI-Powered Analysis",
    description:
      "LLM agent reads your API spec, understands endpoint semantics, and generates optimized MCP tool descriptions that other AI models can actually use.",
    badge: "PydanticAI",
  },
  {
    icon: ShieldCheck,
    title: "Runtime Validated",
    description:
      "Every generated server is syntax-checked, import-verified, and mock-tested before delivery. Broken code never reaches you.",
    badge: "Tested",
  },
  {
    icon: Container,
    title: "Docker Ready",
    description:
      "Output is a complete Docker image with FastMCP, Streamable HTTP transport, and health checks. One command to run.",
    badge: "Production",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center px-6 pt-24 pb-20 text-center">
        {/* Subtle grid background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />

        <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1 text-xs">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Open source MCP server generator
        </Badge>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl">
          Generate MCP servers
          <br />
          <span className="text-emerald-400">from any API</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
          Paste a Swagger URL. AI generates a production-ready MCP server.
          Deploy in Docker. That simple.
        </p>

        <div className="mt-10 flex gap-3">
          <Link
            href="/generate"
            className={cn(
              buttonVariants({ size: "lg" }),
              "gap-2 bg-emerald-500 text-zinc-950 hover:bg-emerald-400",
            )}
          >
            Start generating
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/servers"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            View servers
          </Link>
        </div>
      </section>

      {/* Steps */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <h2 className="mb-12 text-center text-sm font-medium uppercase tracking-widest text-zinc-500">
          How it works
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.label} className="group relative">
              <div className="flex flex-col items-center rounded-xl border border-border/50 bg-zinc-900/50 p-6 text-center transition-colors hover:border-zinc-700 hover:bg-zinc-900">
                <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-zinc-800 text-emerald-400 transition-colors group-hover:bg-emerald-400/10">
                  <step.icon className="size-5" />
                </div>
                <span className="mb-1 text-xs font-medium text-zinc-500">
                  Step {index + 1}
                </span>
                <h3 className="mb-2 text-sm font-semibold text-zinc-50">
                  {step.label}
                </h3>
                <p className="text-xs leading-relaxed text-zinc-500">
                  {step.description}
                </p>
              </div>

              {index < steps.length - 1 && (
                <ChevronRight className="absolute -right-3 top-1/2 hidden size-4 -translate-y-1/2 text-zinc-700 lg:block" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <h2 className="mb-12 text-center text-sm font-medium uppercase tracking-widest text-zinc-500">
          Why mcpgen
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="border-border/50 bg-zinc-900/50 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
            >
              <CardHeader>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-800 text-emerald-400">
                    <feature.icon className="size-4" />
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-[10px] uppercase tracking-wider"
                  >
                    {feature.badge}
                  </Badge>
                </div>
                <CardTitle className="text-base text-zinc-50">
                  {feature.title}
                </CardTitle>
                <CardDescription className="text-sm leading-relaxed text-zinc-500">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="flex flex-col items-center rounded-2xl border border-border/50 bg-zinc-900/30 px-8 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
            Ready to generate your first MCP server?
          </h2>
          <p className="mt-3 max-w-md text-zinc-500">
            Point us at your API spec and get a working MCP server in minutes,
            not days.
          </p>
          <Link
            href="/generate"
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-8 gap-2 bg-emerald-500 text-zinc-950 hover:bg-emerald-400",
            )}
          >
            Get started
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/40 px-6 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-xs text-zinc-600">mcpgen</span>
          <span className="text-xs text-zinc-600">MCP server generator</span>
        </div>
      </footer>
    </div>
  );
}
