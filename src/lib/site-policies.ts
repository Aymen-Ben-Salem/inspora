import type { Route } from "next";
import { SPONSOR_OFFER_DESCRIPTION } from "@/features/sponsorship/pricing";

export type SitePolicy = {
  title: string;
  description: string;
  path: string;
  sections: readonly { id: string; title: string; paragraphs: readonly string[]; links?: readonly {label: string; href: Route}[] }[];
};

export const privacyPolicy: SitePolicy = {
  "title": "Privacy policy",
  "description": "How Inspora handles account information, X connections, published work, payments and audience analytics.",
  "path": "/privacy",
  "sections": [
    {
      "id": "accounts",
      "title": "Accounts and X connections",
      "paragraphs": [
        "When you create or use an Inspora account, Clerk handles sign-in and account security. This can involve your email address, authentication identifiers, sessions and the profile information you provide. Optional authenticator verification and backup codes are managed through your account security settings.",
        "If you choose to connect X, the permissions shown by X allow Clerk to obtain the account information needed for that connection, including your X account ID, username, profile information and email when available. Inspora uses X identity and public profile information for creator profiles and ownership claims. Inspora requests read access for these features; connecting X does not authorize Inspora to publish posts or send messages for you.",
        "Creator account ownership is separate from work attribution. Profile and ownership information may be reviewed to resolve claims, corrections, abuse or account requests. Information you choose to publish on a creator profile or approved work entry is visible to other visitors.",
        "You can review or revoke the X connection through X's connected-app settings. Account connection controls are also available where supported in your Inspora account. Removing a connection and correcting published work attribution are separate requests."
      ]
    },
    {
      "id": "payments",
      "title": "Payments and service providers",
      "paragraphs": [
        "When payment features are available and you use them, Stripe processes checkout and billing. Inspora keeps the account, payment references, status and history needed to provide and reconcile sponsorship.",
        "Sponsor preparations include a company name and email for campaign access, communication and receipts. These contact details are kept privately, separately from the creative you choose to publish. The verified account email is used to prefill Stripe Checkout.",
        "While you verify your email, your browser keeps a temporary copy of your campaign fields and selected files so you can continue without entering them again. The copy is cleared when you continue to payment. Unfinished copies expire after twenty-four hours and are removed when you next use draft storage.",
        "Clerk, X, Stripe, PostHog and Cloudflare process information for their respective services. Their privacy notices are linked below. Contact information and material you send with a support, correction or removal request are used to handle that request."
      ],
      "links": [
        {
          "label": "Clerk privacy notice",
          "href": "https://clerk.com/legal/privacy"
        },
        {
          "label": "X privacy policy",
          "href": "https://x.com/en/privacy"
        },
        {
          "label": "Stripe privacy policy",
          "href": "https://stripe.com/privacy"
        },
        {
          "label": "PostHog privacy notice",
          "href": "https://posthog.com/privacy"
        },
        {
          "label": "Cloudflare privacy policy",
          "href": "https://www.cloudflare.com/privacypolicy/"
        }
      ]
    },
    {
      "id": "analytics",
      "title": "Privacy and audience analytics",
      "paragraphs": [
        "Inspora measures sponsorship delivery with its own accepted-event records. General public-page traffic is measured by PostHog and, where enabled, DataBull. Private account, sponsorship and administrator pages are excluded.",
        "Where enabled, DataBull provides additional public-page analytics in Inspora's own Cloudflare account. It receives public page paths, limited marketing campaign labels, referring origins and foreground-time updates. It derives browser and operating-system categories and versions, and approximate network-based country, region and city information; this does not establish your precise location. Account identities, payment details, arbitrary URL parameters and URL fragments are not sent to this collector.",
        "DataBull runs in cookieless mode: it creates daily pseudonymous visitor identifiers on the server from transient network and browser information, without storing raw IP addresses or visitor identifiers in your cookies or browser storage. These daily estimates can count returning visitors again and do not replace sponsorship delivery reports. DataBull traffic, session and bot-history retention is set to ninety days, with cleanup performed periodically. Automatic click capture and payment linking are not enabled in this integration.",
        "Analytics visitor identifiers are not stored in cookies or browser storage. Our monthly anonymous sponsorship counting key uses transient trusted network and browser information; raw IP addresses, full browser identifiers, account identities and sensitive URLs are not retained in our event records. Shared networks can count together, and changing networks or browsers can count again. Monthly resets can count a returning visitor again in a range crossing months. Missing trustworthy identity contributes delivery, with no invented unique visitor.",
        "A sponsor impression requires at least half the placement to be visible continuously for one foreground second. Clicks count actual outbound activations. Sponsorship Unique visitors counts qualifying impression identities; it is an estimate, not an exact count of people. Video figures measure the displayed preview and exclude repeat loops. A click does not prove a destination visit, signup or sale.",
        "Country uses trusted deployment network geolocation, with an Unknown bucket when unavailable. VPNs, relays and incomplete mapping affect it; this does not establish a visitor's physical location or nationality. We retain coarse devices and sanitized referring domains. PostHog resets anonymous identifiers daily, so their longer-range reach cannot replace our monthly sponsorship reach. Work opens use a tab-only session that resets on reload or after thirty minutes of inactivity.",
        "Accepted raw events are proposed for ninety-day retention only after whole-range and closed-period summaries are finalized. Aggregate reports and history remain for up to twenty-four months. Operational monthly secrets are destroyed one hour after rollover; retained recovery backups may still contain encrypted copies until those backups expire. Backup access is restricted, and secret destruction does not erase those copies.",
        "Separate minute-scoped abuse-control keys bound new event and retry receipts. They never supply reach figures and expire after one hour; raw network addresses are not retained.",
        "We do not use this data for targeted advertising or cross-site tracking. Person profiles, session replay, heatmaps, and automatic interaction capture are disabled. Sponsors may receive aggregate delivery and audience figures; they do not receive browser identifiers or event-level analytics data.",
        "Do Not Track, Global Privacy Control and the site's analytics control disable all analytics collectors. A functional preference cookie stores only this choice, not a visitor identifier. You can disable analytics for your browser using that control on Inspora. The preference remains until you enable analytics again or clear this site's browser data. PostHog's own data handling is described in its privacy notice."
      ]
    },
    {
      "id": "requests",
      "title": "Account and information requests",
      "paragraphs": [
        "Use your account settings where available, or contact Inspora, to request an account correction or deletion. Sign-in accounts, published creator attribution and billing or operational history have different purposes and are handled separately. Records needed to resolve a request, prevent abuse or meet applicable recordkeeping obligations may be retained. Recovery backups can contain earlier captured copies until those backups are removed.",
        "For questions about your account or information, corrections, or a rights-holder removal request, contact the Inspora team using the email below. Include the relevant Inspora URL and the information needed to identify and review your request."
      ]
    }
  ]
};

export const termsPolicy: SitePolicy = {
  "title": "Terms of service",
  "description": "Inspora’s archive, creator-account, attribution, submission and sponsorship policies.",
  "path": "/terms",
  "sections": [
    {
      "id": "archive",
      "title": "The Inspora archive",
      "paragraphs": [
        "Inspora is a curated archive of visual design inspiration and creative work from around the web. These terms describe the policies for using the archive, creator features and sponsorship features when available.",
        "Inspora collects noteworthy visual references that can help designers research ideas, approaches, and execution. Inclusion is selective rather than automatic.",
        "We look for strong craft, originality, relevance, clarity of execution, and usefulness as a design reference. Projects are added when approved, without a fixed publishing schedule.",
        "Categories describe the project's primary discipline and support browsing. We may update a title, category, credit, or source when better information becomes available.",
        "Creator names and original sources are identified where they are known. The View original link is intended to send visitors to the originating project or creator page.",
        "Inspora may publish paid placements. Sponsored entries are clearly marked Sponsor so they can be distinguished from editorial selections."
      ]
    },
    {
      "id": "rights",
      "title": "Attribution and ownership",
      "paragraphs": [
        "Featured work remains the property of its respective creator or rights holder. Inspora's role is to curate, organize, and direct visitors to the original source where one is available.",
        "If a creator name, project title, category, or source link is incomplete or incorrect, we welcome a correction. Broken source links can be reported through the same contact route."
      ]
    },
    {
      "id": "accounts",
      "title": "Creator accounts and submissions",
      "paragraphs": [
        "Provide accurate account and creator-profile information. Only claim a creator identity you are entitled to manage, and only submit material you are entitled to provide. Connecting an X account supports identity verification; it does not transfer rights in featured work.",
        "Keep control of your sign-in methods and any enrolled recovery codes. Submissions and ownership claims are subject to the applicable review process. An account or submission does not guarantee publication, placement or an approved ownership claim."
      ]
    },
    {
      "id": "sponsorship",
      "title": "Sponsorship policy",
      "paragraphs": [
        `${SPONSOR_OFFER_DESCRIPTION} before applicable tax. One-time covers one calendar month from verified payment, with no automatic renewal. Monthly renews every calendar month until cancelled and must be selected explicitly. For business and professional promotion.`,
        "Preparation stays private and uses no seat. Checkout reserves an available seat for 30 minutes; verified payment activates your campaign. One-time ends and releases its seat at expiry. Monthly cancellation preserves the paid period; a failed monthly renewal pauses promotion at expiry and holds your seat for 72 hours."
      ]
    },
    {
      "id": "privacy",
      "title": "Privacy and requests",
      "paragraphs": [
        "The Privacy policy explains account information, provider connections, payments and audience analytics. Featured work remains subject to its original rights, and following an external link takes you to a separate service.",
        "For questions about your account or information, corrections, or a rights-holder removal request, contact the Inspora team using the email below. Include the relevant Inspora URL and the information needed to identify and review your request."
      ],
      "links": [
        {
          "label": "Privacy policy",
          "href": "/privacy"
        },
        {
          "label": "About Inspora and its policies",
          "href": "/info"
        }
      ]
    }
  ]
};
