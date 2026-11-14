import type { Metadata, Route } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { createAuthorizationRoute } from "@/features/inspora-catalog/mcp-authorization";
import { McpConsentForm, type McpConsentProps } from "@/components/inspiration/mcp-consent-form";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Connect to Inspora", robots: { index: false, follow: false } };
const prepare = createAuthorizationRoute();

async function Consent({ searchParams }: { searchParams: Promise<{ ticket?: string | string[] }> }) {
  if ((await headers()).get("host") !== "www.inspora.design") notFound();
  const params = await searchParams, ticket = typeof params.ticket === "string" ? params.ticket : "";
  const url = new URL("https://www.inspora.design/connect/mcp"); url.searchParams.set("ticket", ticket);
  const response = await prepare(new Request(url, { headers: { Accept: "application/json" } }));
  if (response.status === 303) redirect(response.headers.get("location")! as Route);
  if (response.status === 404) notFound();
  if (!response.ok) return <section className={styles.card}><h1>Unable to connect</h1><p>{await response.text()}</p></section>;
  const data = await response.json() as McpConsentProps;
  return <McpConsentForm {...data} />;
}

export default function ConnectMcpPage({ searchParams }: { searchParams: Promise<{ ticket?: string | string[] }> }) {
  return <main className={styles.page}><header className={styles.brand}>Inspora</header><Suspense fallback={<section className={styles.card} aria-busy="true"><h1>Preparing your connection…</h1></section>}><Consent searchParams={searchParams} /></Suspense></main>;
}
