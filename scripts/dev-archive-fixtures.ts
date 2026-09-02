type DevCreatorFixture = {
  avatarUrl: string;
  handle: string;
  name: string;
  url: string;
};

type DevMediaFixture = {
  alt: string;
  height: number;
  url: string;
  width: number;
};

export type DevLogoFixture = {
  colors: string[];
  createdAt: string;
  creator: DevCreatorFixture;
  description: string;
  industry: string;
  kind: "icon" | "logo";
  media: DevMediaFixture;
  shape: string;
  slug: string;
  sourceUrl: string;
  styles: string[];
  title: string;
};

export type DevWebsiteFixture = {
  categories: string[];
  colors: string[];
  createdAt: string;
  creator: DevCreatorFixture;
  description: string;
  favicon: DevMediaFixture;
  fullPage: DevMediaFixture;
  isFeatured: boolean;
  sections: Array<{
    height: number;
    label: string;
    position: number;
    top: number;
  }>;
  slug: string;
  sourceUrl: string;
  tagline: string;
  themes: string[];
  title: string;
};

const defaultAvatar = "/brand/default-avatar.svg";

const creators = {
  fieldOffice: {
    avatarUrl: defaultAvatar,
    handle: "dev-field-office",
    name: "Field Office",
    url: "https://example.com/field-office",
  },
  northPractice: {
    avatarUrl: defaultAvatar,
    handle: "dev-north-practice",
    name: "North Practice",
    url: "https://example.com/north-practice",
  },
  quietStudio: {
    avatarUrl: defaultAvatar,
    handle: "dev-quiet-studio",
    name: "Quiet Studio",
    url: "https://example.com/quiet-studio",
  },
  signalWorks: {
    avatarUrl: defaultAvatar,
    handle: "dev-signal-works",
    name: "Signal Works",
    url: "https://example.com/signal-works",
  },
} satisfies Record<string, DevCreatorFixture>;

const devLogoVisualFixtures: DevLogoFixture[] = [
  {
    slug: "dev-sample-northstar",
    title: "Northstar",
    kind: "logo",
    creator: creators.northPractice,
    description:
      "A sturdy geometric wordmark paired with a compact directional star.",
    industry: "Technology",
    colors: ["Cream", "Black"],
    styles: ["Geometric", "Minimal"],
    shape: "Combination",
    sourceUrl: "https://example.com/northstar",
    createdAt: "2026-09-01T08:00:00.000Z",
    media: {
      url: "/dev-fixtures/logos/northstar-wordmark.svg",
      alt: "Northstar development sample logo",
      width: 1200,
      height: 800,
    },
  },
  {
    slug: "dev-sample-pulse",
    title: "Pulse",
    kind: "logo",
    creator: creators.signalWorks,
    description:
      "An energetic lowercase wordmark connected to a sharp waveform symbol.",
    industry: "Health",
    colors: ["Blue", "White"],
    styles: ["Bold", "Modern"],
    shape: "Combination",
    sourceUrl: "https://example.com/pulse",
    createdAt: "2026-09-01T09:00:00.000Z",
    media: {
      url: "/dev-fixtures/logos/pulse-wordmark.svg",
      alt: "Pulse development sample logo",
      width: 1200,
      height: 800,
    },
  },
  {
    slug: "dev-sample-quarry",
    title: "Quarry",
    kind: "logo",
    creator: creators.fieldOffice,
    description:
      "A warm editorial serif balanced by two interlocking masonry forms.",
    industry: "Architecture",
    colors: ["Grey", "Orange", "Black"],
    styles: ["Editorial", "Classic"],
    shape: "Combination",
    sourceUrl: "https://example.com/quarry",
    createdAt: "2026-09-01T10:00:00.000Z",
    media: {
      url: "/dev-fixtures/logos/quarry-wordmark.svg",
      alt: "Quarry development sample logo",
      width: 1200,
      height: 800,
    },
  },
  {
    slug: "dev-sample-tide",
    title: "Tide",
    kind: "logo",
    creator: creators.quietStudio,
    description:
      "A relaxed wave-led identity built for a coastal hospitality brand.",
    industry: "Hospitality",
    colors: ["Teal", "Cream"],
    styles: ["Organic", "Minimal"],
    shape: "Wordmark",
    sourceUrl: "https://example.com/tide",
    createdAt: "2026-09-01T11:00:00.000Z",
    media: {
      url: "/dev-fixtures/logos/tide-wordmark.svg",
      alt: "Tide development sample logo",
      width: 1200,
      height: 800,
    },
  },
  {
    slug: "dev-sample-lumen-icon",
    title: "Lumen",
    kind: "icon",
    creator: creators.signalWorks,
    description:
      "A high-contrast sun symbol designed to remain clear at compact sizes.",
    industry: "Utilities",
    colors: ["Purple", "White"],
    styles: ["Rounded", "Bold"],
    shape: "Circular",
    sourceUrl: "https://example.com/lumen",
    createdAt: "2026-09-01T12:00:00.000Z",
    media: {
      url: "/dev-fixtures/logos/lumen-icon.svg",
      alt: "Lumen development sample icon",
      width: 800,
      height: 800,
    },
  },
  {
    slug: "dev-sample-orbit-icon",
    title: "Orbit",
    kind: "icon",
    creator: creators.northPractice,
    description:
      "An orbital system with a bright satellite accent and soft central core.",
    industry: "Science",
    colors: ["Black", "Mint", "Coral"],
    styles: ["Futuristic", "Geometric"],
    shape: "Circular",
    sourceUrl: "https://example.com/orbit",
    createdAt: "2026-09-01T13:00:00.000Z",
    media: {
      url: "/dev-fixtures/logos/orbit-icon.svg",
      alt: "Orbit development sample icon",
      width: 800,
      height: 800,
    },
  },
  {
    slug: "dev-sample-seed-icon",
    title: "Seed",
    kind: "icon",
    creator: creators.quietStudio,
    description:
      "A simple sprouting mark for testing organic and sustainability filters.",
    industry: "Agriculture",
    colors: ["Green", "Cream"],
    styles: ["Organic", "Friendly"],
    shape: "Square",
    sourceUrl: "https://example.com/seed",
    createdAt: "2026-09-01T14:00:00.000Z",
    media: {
      url: "/dev-fixtures/logos/seed-icon.svg",
      alt: "Seed development sample icon",
      width: 800,
      height: 800,
    },
  },
  {
    slug: "dev-sample-prism-icon",
    title: "Prism",
    kind: "icon",
    creator: creators.fieldOffice,
    description:
      "A bright faceted emblem that exercises multi-colour icon presentation.",
    industry: "Creative",
    colors: ["Pink", "Yellow", "Purple"],
    styles: ["Playful", "Geometric"],
    shape: "Diamond",
    sourceUrl: "https://example.com/prism",
    createdAt: "2026-09-01T15:00:00.000Z",
    media: {
      url: "/dev-fixtures/logos/prism-icon.svg",
      alt: "Prism development sample icon",
      width: 800,
      height: 800,
    },
  },
];

const devWebsiteVisualFixtures: DevWebsiteFixture[] = [
  {
    slug: "dev-sample-atelier-24",
    title: "Atelier / 24",
    tagline: "A bright editorial portfolio for an independent creative studio.",
    creator: creators.fieldOffice,
    description:
      "An expressive studio website combining large serif typography, playful colour fields, selected work, testimonials, and a direct project call to action.",
    categories: ["Portfolio", "Agency"],
    themes: ["Light", "Editorial"],
    colors: ["Cream", "Lime", "Purple", "Orange"],
    sourceUrl: "https://example.com/atelier-24",
    isFeatured: true,
    createdAt: "2026-09-01T16:00:00.000Z",
    fullPage: {
      url: "/dev-fixtures/websites/atelier.svg",
      alt: "Full-page development sample of the Atelier 24 website",
      width: 1440,
      height: 6000,
    },
    favicon: {
      url: "/dev-fixtures/logos/prism-icon.svg",
      alt: "Atelier 24 favicon",
      width: 800,
      height: 800,
    },
    sections: [
      { label: "Hero", top: 0, height: 1500, position: 0 },
      { label: "Selected projects", top: 1500, height: 1100, position: 1 },
      { label: "Studio introduction", top: 2600, height: 1100, position: 2 },
      { label: "Testimonial", top: 3700, height: 900, position: 3 },
      { label: "Contact and footer", top: 4600, height: 1400, position: 4 },
    ],
  },
  {
    slug: "dev-sample-pilot-workspace",
    title: "Pilot Workspace",
    tagline:
      "A focused project-management landing page for modern product teams.",
    creator: creators.signalWorks,
    description:
      "A dark software website with a product-led hero, interface preview, benefit cards, dashboard story, customer proof, and conversion-focused closing section.",
    categories: ["SaaS", "Product"],
    themes: ["Dark", "Technology"],
    colors: ["Navy", "Mint", "Purple", "White"],
    sourceUrl: "https://example.com/pilot-workspace",
    isFeatured: false,
    createdAt: "2026-09-01T17:00:00.000Z",
    fullPage: {
      url: "/dev-fixtures/websites/pilot.svg",
      alt: "Full-page development sample of the Pilot Workspace website",
      width: 1440,
      height: 6400,
    },
    favicon: {
      url: "/dev-fixtures/logos/orbit-icon.svg",
      alt: "Pilot Workspace favicon",
      width: 800,
      height: 800,
    },
    sections: [
      { label: "Hero and product", top: 0, height: 1800, position: 0 },
      { label: "Benefits", top: 1800, height: 1200, position: 1 },
      { label: "Dashboard", top: 3000, height: 1300, position: 2 },
      { label: "Customer proof", top: 4300, height: 700, position: 3 },
      { label: "Call to action", top: 5000, height: 1400, position: 4 },
    ],
  },
  {
    slug: "dev-sample-morning-market",
    title: "Morning Market",
    tagline: "A warm online shop for useful objects from independent makers.",
    creator: creators.quietStudio,
    description:
      "A colourful editorial commerce concept featuring a product-led hero, new arrivals, brand story, journal cards, newsletter invitation, and practical footer.",
    categories: ["E-commerce", "Retail"],
    themes: ["Light", "Playful"],
    colors: ["Cream", "Orange", "Green", "Yellow"],
    sourceUrl: "https://example.com/morning-market",
    isFeatured: true,
    createdAt: "2026-09-01T18:00:00.000Z",
    fullPage: {
      url: "/dev-fixtures/websites/market.svg",
      alt: "Full-page development sample of the Morning Market website",
      width: 1440,
      height: 5800,
    },
    favicon: {
      url: "/dev-fixtures/logos/seed-icon.svg",
      alt: "Morning Market favicon",
      width: 800,
      height: 800,
    },
    sections: [
      { label: "Hero", top: 0, height: 1450, position: 0 },
      { label: "New arrivals", top: 1450, height: 1050, position: 1 },
      { label: "Brand story", top: 2500, height: 1150, position: 2 },
      { label: "Journal", top: 3650, height: 1150, position: 3 },
      { label: "Newsletter and footer", top: 4800, height: 1000, position: 4 },
    ],
  },
];

function repeatLogoFixtures(
  kind: DevLogoFixture["kind"],
  count: number,
  hourOffset: number,
) {
  const visuals = devLogoVisualFixtures.filter(
    (fixture) => fixture.kind === kind,
  );

  return Array.from({ length: count }, (_, index): DevLogoFixture => {
    const visual = visuals[index % visuals.length];

    if (index < visuals.length) return visual;

    const repetition = Math.floor(index / visuals.length) + 1;
    const title = `${visual.title} Study ${repetition}`;

    return {
      ...visual,
      slug: `${visual.slug}-repeat-${repetition}`,
      title,
      sourceUrl: `${visual.sourceUrl}?sample=${repetition}`,
      createdAt: new Date(
        Date.UTC(2026, 7, 30, hourOffset + index),
      ).toISOString(),
      media: {
        ...visual.media,
        alt: `${title} development sample ${kind}`,
      },
    };
  });
}

function repeatWebsiteFixtures(count: number) {
  return Array.from({ length: count }, (_, index): DevWebsiteFixture => {
    const visual =
      devWebsiteVisualFixtures[index % devWebsiteVisualFixtures.length];

    if (index < devWebsiteVisualFixtures.length) return visual;

    const repetition = Math.floor(index / devWebsiteVisualFixtures.length) + 1;
    const title = `${visual.title} Edition ${repetition}`;

    return {
      ...visual,
      slug: `${visual.slug}-repeat-${repetition}`,
      title,
      sourceUrl: `${visual.sourceUrl}?sample=${repetition}`,
      createdAt: new Date(Date.UTC(2026, 7, 31, index)).toISOString(),
      fullPage: {
        ...visual.fullPage,
        alt: `Full-page development sample of ${title}`,
      },
      favicon: {
        ...visual.favicon,
        alt: `${title} favicon`,
      },
    };
  });
}

export const devLogoFixtures: DevLogoFixture[] = [
  ...repeatLogoFixtures("logo", 15, 0),
  ...repeatLogoFixtures("icon", 15, 12),
];

export const devWebsiteFixtures = repeatWebsiteFixtures(11);
