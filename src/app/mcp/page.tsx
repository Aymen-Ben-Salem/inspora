import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteNavbar } from "@/components/site-navbar";
import { McpClientSetup } from "@/components/inspiration/mcp-client-setup";
import { isMcpPreviewEnabled } from "@/features/inspiration/preview";

export const metadata: Metadata = { title: "Inspora MCP — Preview", description: "Explore Inspora references from Claude Code and Codex with the local MCP pilot.", robots: { index: false, follow: false } };

export default function McpPage() {
  if (!isMcpPreviewEnabled()) notFound();
  return (
    <main className="min-h-[100dvh] bg-white text-[#262626]">
      <SiteNavbar page="mcp" />
      <div className="archive-frame pb-24 pt-16 sm:pt-24">
        <section className="grid gap-12 border-b border-[#e6e6e6] pb-16 lg:grid-cols-[1fr_0.9fr] lg:gap-20 lg:pb-24">
          <div>
            <h1 className="max-w-[680px] text-[38px] font-normal leading-[1.06] tracking-[-0.045em] sm:text-[54px]">Your next reference<br />starts with an idea.</h1>
            <p className="mt-7 max-w-[560px] text-[18px] leading-[1.5] tracking-[-0.015em] text-[#767676] sm:text-[20px]">Find Inspora designs, websites, logos and app icons from the conversation you’re already having in Claude Code or Codex.</p>
            <a href="#setup" className="focus-ring mt-8 inline-flex rounded-md bg-[#262626] px-5 py-3 text-[14px] text-white transition-colors hover:bg-black">Set up the local pilot</a>
            <p className="mt-4 text-[13px] text-[#767676]">Preview for team review. Runs on your computer.</p>
          </div>
          <div className="self-center rounded-md bg-[#fafafa] p-6 sm:p-9">
            <p className="text-sm text-[#767676]">Try a request</p>
            <blockquote className="mt-6 text-[25px] leading-[1.35] tracking-[-0.025em] sm:text-[30px]">“Find six calm, minimal app icons with warm colors.”</blockquote>
            <div className="mt-8 border-t border-[#e6e6e6] pt-6 text-[15px] leading-7 text-[#767676]"><p>Start with a written idea or an Inspora work link.</p><p>Get a compact shortlist with creator credits and links.</p><p>Ask for details, a preview, or more results when you need them.</p></div>
          </div>
        </section>
        <section className="grid gap-9 py-14 lg:grid-cols-[1fr_0.9fr] lg:gap-20 lg:py-20" aria-labelledby="use-title">
          <div><h2 id="use-title" className="text-[28px] leading-tight tracking-[-0.03em]">Stay with the idea.</h2><p className="mt-5 max-w-[560px] text-[16px] leading-7 text-[#767676]">Describe a direction, follow a reference, then narrow the search. Six results is the starting point; ask for anywhere from one to twenty. Continue without seeing the same work twice.</p></div>
          <ul className="space-y-5 text-[16px] leading-7"><li>“Show me geometric wordmarks, in black and white.”</li><li>“Find alternatives to this Inspora link.”</li><li>“Keep the shortlist to websites. Show me the details for these two.”</li></ul>
        </section>
        <section id="setup" className="scroll-mt-24 border-t border-[#e6e6e6] py-14 lg:py-20" aria-labelledby="setup-title">
          <div className="grid gap-9 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
            <div><h2 id="setup-title" className="text-[28px] leading-tight tracking-[-0.03em]">Connect your workspace.</h2><p className="mt-5 max-w-[540px] text-[16px] leading-7 text-[#767676]">Use the Preview checkout and the current pilot catalog from the team. Setup instructions live in <code className="text-[14px] text-[#262626]">tools/inspora-mcp/README.md</code>. Install the dependencies, prepare the local model and build the index before connecting.</p><p className="mt-5 max-w-[540px] text-[16px] leading-7 text-[#767676]">The catalog is a dated local snapshot. Refresh it to include new work or editorial changes. No production database credentials are needed in either client.</p></div>
            <McpClientSetup />
          </div>
        </section>
        <section className="grid gap-9 border-t border-[#e6e6e6] pt-14 lg:grid-cols-[1fr_0.9fr] lg:gap-20" aria-labelledby="next-title">
          <div><h2 id="next-title" className="text-[28px] leading-tight tracking-[-0.03em]">Next: bring a reference image.</h2><p className="mt-5 max-w-[540px] text-[16px] leading-7 text-[#767676]">Uploaded reference images are planned for Phase 2. This pilot accepts written ideas and existing Inspora links. Image privacy, storage and matching quality will be reviewed before uploads are enabled.</p></div>
          <div className="text-[15px] leading-7 text-[#767676]"><p>We’re testing how useful the results are across twenty real requests. Close matches may be limited; the pilot labels alternatives and returns fewer results when needed.</p><p className="mt-4">Links do not guarantee an image preview in every client. The local service is read-only; your AI client’s normal provider usage still applies.</p></div>
        </section>
      </div>
    </main>
  );
}
