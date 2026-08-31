"use client";

import { BottomSheet } from "./bottom-sheet";
import { NewsletterForm } from "./newsletter-form";

export function SubscribeSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Fresh inspiration, delivered."
      description="A concise selection of recent design references, sent to your inbox."
    >
      <div className="flex justify-center">
        <NewsletterForm source="mobile-sheet" />
      </div>
    </BottomSheet>
  );
}
