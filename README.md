# Inspora

Inspora is a curated archive of contemporary visual work—a focused place to discover strong ideas across web design, branding, product, motion, illustration, 3D, and print.

The experience is built around the work itself. A responsive visual feed makes the archive easy to scan, category filters narrow the collection without interrupting the flow, and each project opens into an immersive gallery with creator attribution, project context, and a link back to the original source.

## The experience

- A responsive, image-led archive designed for quick visual discovery
- Category filters for moving between creative disciplines
- Detailed project galleries for images, animated GIFs, and video
- Clear creator credits, project metadata, and original-source links
- An email subscription form for people who want to follow the archive

## Editorial workflow

Inspora includes a private editorial workspace for managing the collection. Administrators can create drafts, publish and archive posts, upload media directly, retain externally hosted media when needed, and manage the subscriber list.

Uploaded assets are stored in Cloudflare R2 and delivered through Inspora's cached media domain. Post and subscriber data live in Neon Postgres, with Drizzle providing the application’s data layer. Clerk protects the editorial workspace while the public archive remains open to browse.

## Built with

- Next.js and TypeScript
- Neon Postgres and Drizzle ORM
- Clerk authentication
- Cloudflare R2 media storage and delivery
- GSAP motion

Inspora is designed as a calm, fast-moving reference library: minimal interface, generous space, and as little friction as possible between a visitor and the work that caught their attention.
