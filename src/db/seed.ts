import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import { loadDevelopmentMediaEnvironment } from "../../scripts/lib/development-environment";
import { seedPosts } from "../data/seed-posts";
import { creators, postMedia, posts } from "./schema";

const environment = loadDevelopmentMediaEnvironment();
const database = drizzle({ client: neon(environment.databaseUrlUnpooled) });

async function main() {
  for (const post of seedPosts) {
    const [existingCreator] = await database
      .select({ id: creators.id })
      .from(creators)
      .where(eq(creators.name, post.creator.name))
      .limit(1);
    const [savedCreator] = existingCreator
      ? await database
          .update(creators)
          .set({
            name: post.creator.name,
            handle: post.creator.handle,
            url: post.creator.url,
            avatarUrl: post.creator.avatarUrl,
            updatedAt: new Date(),
          })
          .where(eq(creators.id, existingCreator.id))
          .returning({ id: creators.id })
      : await database
          .insert(creators)
          .values({
            name: post.creator.name,
            handle: post.creator.handle,
            url: post.creator.url,
            avatarUrl: post.creator.avatarUrl,
          })
          .returning({ id: creators.id });

    if (!savedCreator) throw new Error(`Could not seed creator: ${post.creator.name}`);

    const [savedPost] = await database
      .insert(posts)
      .values({
        slug: post.slug,
        title: post.title,
        creatorId: savedCreator.id,
        description: post.description,
        category: post.category,
        industries: post.industries,
        colors: post.colors,
        styles: post.styles,
        sourceUrl: post.sourceUrl,
        isFeatured: post.isFeatured,
        status: "published",
        createdAt: new Date(post.createdAt),
        publishedAt: new Date(post.publishedAt),
      })
      .onConflictDoUpdate({
        target: posts.slug,
        set: {
          title: post.title,
          creatorId: savedCreator.id,
          description: post.description,
          category: post.category,
          industries: post.industries,
          colors: post.colors,
          styles: post.styles,
          sourceUrl: post.sourceUrl,
          isFeatured: post.isFeatured,
          status: "published",
          publishedAt: new Date(post.publishedAt),
          updatedAt: new Date(),
        },
      })
      .returning({ id: posts.id });

    if (!savedPost) throw new Error(`Could not seed post: ${post.slug}`);

    for (const media of post.media) {
      await database
        .insert(postMedia)
        .values({
          postId: savedPost.id,
          type: media.type,
          url: media.url,
          posterUrl: media.posterUrl,
          alt: media.alt,
          width: media.width,
          height: media.height,
          position: media.position,
        })
        .onConflictDoUpdate({
          target: [postMedia.postId, postMedia.position],
          set: {
            type: media.type,
            url: media.url,
            posterUrl: media.posterUrl,
            alt: media.alt,
            width: media.width,
            height: media.height,
          },
        });
    }
  }

  console.log(`Seeded ${seedPosts.length} posts into Neon.`);
}

main().catch((error: unknown) => {
  console.error("Failed to seed Neon:", error);
  process.exitCode = 1;
});
