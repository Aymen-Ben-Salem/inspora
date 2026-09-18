import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  modalDismissalIntent,
  nextContainedFocusIndex,
  ProfileModal,
} from "./profile-modal";

describe("profile modal mechanics", () => {
  it("labels a centered dialog without rendering a close control", () => {
    const html = renderToStaticMarkup(
      <ProfileModal open label="Edit Profile" onDismiss={vi.fn()}>
        <button type="button">Save</button>
      </ProfileModal>,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Edit Profile");
    expect(html).not.toContain("Close");
  });

  it("asks before discarding dirty input but lets Back preserve it", () => {
    expect(modalDismissalIntent({ dirty: true, reason: "backdrop" })).toBe("confirm");
    expect(modalDismissalIntent({ dirty: true, reason: "escape" })).toBe("confirm");
    expect(modalDismissalIntent({ dirty: true, reason: "back" })).toBe("back");
    expect(modalDismissalIntent({ dirty: false, reason: "backdrop" })).toBe("dismiss");
  });

  it("wraps keyboard focus inside the dialog", () => {
    expect(nextContainedFocusIndex({ current: 0, count: 3, shift: true })).toBe(2);
    expect(nextContainedFocusIndex({ current: 2, count: 3, shift: false })).toBe(0);
    expect(nextContainedFocusIndex({ current: 1, count: 3, shift: false })).toBe(2);
    expect(nextContainedFocusIndex({ current: -1, count: 3, shift: true })).toBe(2);
    expect(nextContainedFocusIndex({ current: -1, count: 3, shift: false })).toBe(0);
  });
});
