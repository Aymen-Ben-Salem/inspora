import type { Website } from "@/domain/website";

import { FeedSaveButton } from "../feed-save-overlay";
import { LoopingVideo } from "../looping-video";
import { WebsiteFeedCaption } from "./website-feed-caption";

export function WebsiteCard({
  website,
  onSelect,
  priority = false,
  lazyPoster = false,
  initiallySaved = false,
  onSavedChange,
}: {
  website: Website;
  onSelect: (website: Website) => void;
  priority?: boolean;
  lazyPoster?: boolean;
  initiallySaved?: boolean;
  onSavedChange?: (saved: boolean) => void;
}) {
  return (
    <article data-feed-card className="self-start">
      <div className="group relative">
      <button
        type="button"
        data-feed-post-id={website.id}
        data-feed-post-pathname={`/websites?website=${website.slug}`}
        data-feed-post-title={website.title}
        data-feed-creator-name={website.creator.name}
        aria-label={`View ${website.title} website`}
        onClick={() => onSelect(website)}
        className="focus-ring group block w-full cursor-pointer text-left"
      >
        <div
          data-feed-transition-target
          className="relative w-full overflow-hidden bg-[#ececea]"
        >
          {priority ? <link rel="preload" as="image" href={website.recording.posterUrl} fetchPriority="high" /> : null}
          <LoopingVideo
            src={website.recording.videoPreview.url}
            poster={website.recording.posterUrl}
            width={website.recording.videoPreview.width}
            height={website.recording.videoPreview.height}
            lazyPoster={lazyPoster && !priority}
            aria-label={website.recording.alt}
            suspendWithFeed
            className="block h-auto w-full"
          />
          <span className="pointer-events-none absolute inset-0 border border-black/[0.06]" />
        </div>
      </button>
      <FeedSaveButton postId={website.id} initiallySaved={initiallySaved} onSavedChange={onSavedChange} />
      </div>
      <button type="button" onClick={() => onSelect(website)} className="focus-ring block w-full cursor-pointer text-left" aria-label={`View ${website.title} website details`}>
        <WebsiteFeedCaption title={website.title} description={website.tagline} iconUrl={website.favicon.url} />
      </button>
    </article>
  );
}
