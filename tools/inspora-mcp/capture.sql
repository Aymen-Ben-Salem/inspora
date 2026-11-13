WITH works AS (
SELECT 'design' AS kind, p.id,p.slug,p.title,p.description,''::text AS tagline,c.name AS creator_name,c.username AS creator_username,p.category,p.industries,p.styles,p.colors,ARRAY[]::text[] AS categories,ARRAY[]::text[] AS themes,ARRAY[]::text[] AS technologies,''::text AS industry,''::text AS shape,p.source_url,
p.status,p.published_at,p.updated_at::text AS updated_at,c.updated_at::text AS creator_updated_at,(c.trashed_at IS NULL) AS creator_visible,
(SELECT jsonb_agg(jsonb_build_object('type',m.type,'url',m.url,'poster',m.poster_url,'alt',m.alt,'width',m.width,'height',m.height) ORDER BY m.position) FROM post_media m WHERE m.post_id=p.id) AS media
FROM posts p JOIN creators c ON c.id=p.creator_id WHERE p.status='published' AND p.published_at<=now() AND c.trashed_at IS NULL
UNION ALL
SELECT l.kind,l.id,l.slug,l.title,l.description,'',c.name,c.username,'',ARRAY[]::text[],l.styles,l.colors,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],l.industry,l.shape,l.source_url,
l.status,l.published_at,l.updated_at::text,c.updated_at::text,(c.trashed_at IS NULL),
(SELECT jsonb_agg(jsonb_build_object('type','image','url',m.url,'alt',m.alt,'width',m.width,'height',m.height)) FROM logo_media m WHERE m.logo_id=l.id)
FROM logos l JOIN creators c ON c.id=l.creator_id WHERE l.status='published' AND l.published_at<=now() AND c.trashed_at IS NULL
UNION ALL
SELECT 'website',w.id,w.slug,w.title,w.description,w.tagline,c.name,c.username,'',ARRAY[]::text[],ARRAY[]::text[],w.colors,w.categories,w.themes,w.technologies,'','',w.source_url,
w.status,w.published_at,w.updated_at::text,c.updated_at::text,(c.trashed_at IS NULL),
(SELECT jsonb_agg(jsonb_build_object('type',m.role,'url',m.url,'poster',m.poster_url,'preview',m.video_preview,'alt',m.alt,'width',m.width,'height',m.height) ORDER BY m.role) FROM website_media m WHERE m.website_id=w.id AND m.role<>'full_page')
FROM websites w JOIN creators c ON c.id=w.creator_id WHERE w.status='published' AND w.published_at<=now() AND c.trashed_at IS NULL
AND EXISTS(SELECT 1 FROM website_media m WHERE m.website_id=w.id AND m.role='recording' AND coalesce(m.poster_url,'')<>'' AND m.video_preview IS NOT NULL AND m.video_preview<>'null'::jsonb)
AND EXISTS(SELECT 1 FROM website_media m WHERE m.website_id=w.id AND m.role='favicon')
) SELECT * FROM works ORDER BY kind,id
