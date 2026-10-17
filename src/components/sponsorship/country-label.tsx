"use client";
import { useState } from "react";
import Image from "next/image";
import countries from "./countries.json";
import styles from "./dashboard.module.css";

// Names and local SVG flags: flag-icons 7.6.0 (MIT).
// The license is retained at public/icons/flags/LICENSE.txt.
export function countryName(code: string) {
  return (countries as Record<string, string>)[code.toUpperCase()] ?? "Unknown";
}

export function CountryLabel({ code }: { code: string }) {
  const normalized = code.toUpperCase();
  const name = countryName(normalized);
  const [failedCode, setFailedCode] = useState<string | null>(null);
  const known = name !== "Unknown";
  // These are readable English abbreviations, not ISO alpha-3 identifiers.
  const abbreviation = ({ US: "USA", GB: "GBR", AE: "UAE", NZ: "NZL" } as Record<string, string>)[normalized] ?? name.slice(0, 3).toUpperCase();
  return <span className={styles.countryLabel}>
    <span className={styles.countryFlag} aria-hidden="true">
      {known && failedCode !== normalized ? <Image
        src={`/icons/flags/${normalized.toLowerCase()}.svg`}
        width={24} height={18} alt="" unoptimized
        onError={() => setFailedCode(normalized)}
      /> : <span className={styles.countryFallback}>{known ? abbreviation : "—"}</span>}
    </span>
    <span>{name}</span>
  </span>;
}
