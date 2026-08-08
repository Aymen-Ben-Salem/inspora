export const ANALYTICS_EVENTS = {
  newsletterSubscribed: "newsletter subscribed",
  postOpened: "post opened",
  postSourceVisited: "post source visited",
} as const;

export type AnalyticsEventProperties = {
  [ANALYTICS_EVENTS.newsletterSubscribed]: {
    source: "header" | "post-detail";
  };
  [ANALYTICS_EVENTS.postOpened]: {
    category: string;
    creator_id: string;
    creator_name: string;
    post_id: string;
    post_slug: string;
    post_title: string;
  };
  [ANALYTICS_EVENTS.postSourceVisited]: {
    category: string;
    creator_id: string;
    post_id: string;
    post_slug: string;
    post_title: string;
  };
};

export type AnalyticsEventName = keyof AnalyticsEventProperties;
