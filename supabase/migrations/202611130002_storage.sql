-- Run in Supabase, after the application migration. No public bucket or client write policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gannyland-media','gannyland-media',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4'])
on conflict(id) do nothing;
