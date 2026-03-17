import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Header } from "@/components/layout/header"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "mcpgen — Generate MCP Servers from Any API",
  description:
    "Paste a Swagger URL, AI generates a production-ready MCP server, deploy in Docker.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased`}>
        <Header />
        <main className="pt-14">{children}</main>
        <Toaster />
      </body>
    </html>
  )
}
