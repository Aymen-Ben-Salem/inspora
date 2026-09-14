/** Remember the email card's rendered size before Clerk swaps in verification. */
export function observeAuthCardHeight(dialog: HTMLElement) {
  let observedCard: HTMLElement | null = null;
  let lastHeight = 0;

  const measure = () => {
    const card = dialog.querySelector<HTMLElement>(".cl-cardBox");
    if (card !== observedCard) {
      if (observedCard) resizeObserver.unobserve(observedCard);
      observedCard = card;
      if (card) resizeObserver.observe(card);
    }
    // Do not learn the OTP screen's height or a transient loading screen.
    if (!card || card.querySelector(".cl-otpCodeField") || !card.querySelector('input[name="identifier"], input[name="emailAddress"]')) return;
    const height = card.getBoundingClientRect().height;
    if (height > 0 && height !== lastHeight) {
      lastHeight = height;
      dialog.style.setProperty("--auth-card-height", height + "px");
    }
  };
  const resizeObserver = new ResizeObserver(measure);
  const mutationObserver = new MutationObserver(measure);
  mutationObserver.observe(dialog, { childList: true, subtree: true });
  measure();

  return () => {
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  };
}
