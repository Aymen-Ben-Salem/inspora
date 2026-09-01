"use client";

import { useEffect, useState } from "react";

type InfoPageLink = {
  href: `#${string}`;
  label: string;
};

export function InfoPageNavigation({
  links,
}: {
  links: readonly InfoPageLink[];
}) {
  const [activeId, setActiveId] = useState(() => links[0]?.href.slice(1) ?? "");

  useEffect(() => {
    const sectionIds = links.map((link) => link.href.slice(1));
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);

    function syncFromHash() {
      const hashId = window.location.hash.slice(1);
      if (sectionIds.includes(hashId)) setActiveId(hashId);
    }

    syncFromHash();

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSection = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          )[0];

        if (visibleSection) setActiveId(visibleSection.target.id);
      },
      {
        rootMargin: "-18% 0px -68% 0px",
        threshold: 0,
      },
    );

    sections.forEach((section) => observer.observe(section));
    window.addEventListener("hashchange", syncFromHash);

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", syncFromHash);
    };
  }, [links]);

  return (
    <nav aria-label="On this page" className="sticky top-10">
      <p className="text-[13px] leading-none text-[#b0b0b0]">On this page</p>
      <div className="mt-4 flex flex-col items-start gap-2.5">
        {links.map((link) => {
          const id = link.href.slice(1);
          const active = activeId === id;

          return (
            <a
              key={link.href}
              href={link.href}
              aria-current={active ? "location" : undefined}
              onClick={() => setActiveId(id)}
              className={`focus-ring text-[14px] leading-[1.35] transition-colors ${
                active
                  ? "font-medium text-[#262626]"
                  : "text-[#929292] hover:text-[#555]"
              }`}
            >
              {link.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
