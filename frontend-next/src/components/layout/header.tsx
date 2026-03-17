"use client"

import Link from "next/link"
import { Terminal } from "lucide-react"

function Header() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-border/40 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Terminal className="size-5 text-emerald-400" />
          <span className="text-lg font-semibold tracking-tight text-zinc-50">
            mcpgen
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/generate"
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-50"
          >
            Generate
          </Link>
          <Link
            href="/servers"
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-50"
          >
            Servers
          </Link>
        </nav>
      </div>
    </header>
  )
}

export { Header }
