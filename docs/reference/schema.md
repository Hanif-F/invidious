# SQL schema

[Documentation index](../README.md)

Generated from all files in [config/sql](../../config/sql) by [generate_reference.py](../tools/generate_reference.py). Regenerate after changing the source; do not edit generated tables manually.

Fresh-install DDL is reproduced exactly so every column, default, index, key and constraint is available here. This is a reference, not a migration script: some files contain non-idempotent type creation and order dependencies. Use the migration procedure in [database](../database.md). Runtime migrations also create tracking and subscription materialized views.

## ai_slist_snapshots

Source: [config/sql/ai_slist_snapshots.sql](../../config/sql/ai_slist_snapshots.sql).

```sql
CREATE TABLE IF NOT EXISTS public.ai_slist_snapshots (
    kind text PRIMARY KEY CHECK (kind IN ('blocklist', 'warnlist')),
    body text NOT NULL,
    updated_at timestamptz NOT NULL
);
GRANT ALL ON TABLE public.ai_slist_snapshots TO current_user;
```

## annotations

Source: [config/sql/annotations.sql](../../config/sql/annotations.sql).

```sql
-- Table: public.annotations

-- DROP TABLE public.annotations;

CREATE TABLE IF NOT EXISTS public.annotations
(
  id text NOT NULL,
  annotations xml,
  CONSTRAINT annotations_id_key UNIQUE (id)
);

GRANT ALL ON TABLE public.annotations TO current_user;
```

## auth_rate_limits

Source: [config/sql/auth_rate_limits.sql](../../config/sql/auth_rate_limits.sql).

```sql
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry_idx ON public.auth_rate_limits (expires_at);
```

## blocked_channels

Source: [config/sql/blocked_channels.sql](../../config/sql/blocked_channels.sql).

```sql
CREATE TABLE IF NOT EXISTS public.blocked_channels
(
  email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  ucid text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, ucid)
);
GRANT ALL ON TABLE public.blocked_channels TO current_user;
```

## channel_avatars

Source: [config/sql/channel_avatars.sql](../../config/sql/channel_avatars.sql).

```sql
CREATE TABLE IF NOT EXISTS public.channel_avatars (
    ucid text PRIMARY KEY,
    url text NOT NULL,
    observed_at timestamptz NOT NULL
);
GRANT ALL ON TABLE public.channel_avatars TO current_user;
```

## channel_handles

Source: [config/sql/channel_handles.sql](../../config/sql/channel_handles.sql).

```sql
CREATE TABLE IF NOT EXISTS public.channel_handles (
    ucid text PRIMARY KEY,
    handle text,
    checked_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS channel_handles_expiry_idx ON public.channel_handles (expires_at);
GRANT ALL ON TABLE public.channel_handles TO current_user;
```

## channel_videos

Source: [config/sql/channel_videos.sql](../../config/sql/channel_videos.sql).

```sql
-- Table: public.channel_videos

-- DROP TABLE public.channel_videos;

CREATE TABLE IF NOT EXISTS public.channel_videos
(
  id text NOT NULL,
  title text,
  published timestamp with time zone,
  updated timestamp with time zone,
  ucid text,
  author text,
  length_seconds integer,
  live_now boolean,
  premiere_timestamp timestamp with time zone,
  views bigint,
  members_only boolean NOT NULL DEFAULT false,
  CONSTRAINT channel_videos_id_key UNIQUE (id)
);

GRANT ALL ON TABLE public.channel_videos TO current_user;

-- Index: public.channel_videos_ucid_idx

-- DROP INDEX public.channel_videos_ucid_idx;

CREATE INDEX IF NOT EXISTS channel_videos_ucid_idx
  ON public.channel_videos
  USING btree
  (ucid COLLATE pg_catalog."default");
```

## channels

Source: [config/sql/channels.sql](../../config/sql/channels.sql).

```sql
-- Table: public.channels

-- DROP TABLE public.channels;

CREATE TABLE IF NOT EXISTS public.channels
(
  id text NOT NULL,
  author text,
  updated timestamp with time zone,
  deleted boolean,
  subscribed timestamp with time zone,
  CONSTRAINT channels_id_key UNIQUE (id)
);

GRANT ALL ON TABLE public.channels TO current_user;

-- Index: public.channels_id_idx

-- DROP INDEX public.channels_id_idx;

CREATE INDEX IF NOT EXISTS channels_id_idx
  ON public.channels
  USING btree
  (id COLLATE pg_catalog."default");
```

## chat_timing_offsets

Source: [config/sql/chat_timing_offsets.sql](../../config/sql/chat_timing_offsets.sql).

```sql
CREATE TABLE IF NOT EXISTS public.chat_timing_offsets
(
    email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    video_id text NOT NULL,
    offset_ms integer NOT NULL CHECK (offset_ms BETWEEN -3600000 AND 3600000),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (email, video_id)
);

CREATE INDEX IF NOT EXISTS chat_timing_offsets_email_updated_idx
    ON public.chat_timing_offsets (email, updated_at DESC);

GRANT ALL ON TABLE public.chat_timing_offsets TO current_user;
```

## clips

Source: [config/sql/clips.sql](../../config/sql/clips.sql).

```sql
CREATE TABLE IF NOT EXISTS public.clips
(
  id text PRIMARY KEY CHECK (id ~ '^IVCL[a-zA-Z0-9_-]{32}$'),
  owner text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  video_id text NOT NULL,
  ucid text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  start_ms bigint NOT NULL CHECK (start_ms >= 0),
  end_ms bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  video_title text NOT NULL,
  channel_name text NOT NULL,
  video_duration integer NOT NULL,
  CHECK (end_ms - start_ms BETWEEN 5000 AND 120000),
  CHECK (end_ms <= video_duration::bigint * 1000)
);
CREATE INDEX IF NOT EXISTS clips_owner_created_idx ON public.clips (owner, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS clips_channel_created_idx ON public.clips (ucid, created_at DESC, id DESC);
GRANT ALL ON TABLE public.clips TO current_user;
```

## dearrow_identities

Source: [config/sql/dearrow_identities.sql](../../config/sql/dearrow_identities.sql).

```sql
CREATE TABLE IF NOT EXISTS public.dearrow_identities
(
  email text PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
  ciphertext text NOT NULL
);
GRANT ALL ON TABLE public.dearrow_identities TO current_user;
```

## nonces

Source: [config/sql/nonces.sql](../../config/sql/nonces.sql).

```sql
-- Table: public.nonces

-- DROP TABLE public.nonces;

CREATE TABLE IF NOT EXISTS public.nonces
(
  nonce text,
  expire timestamp with time zone,
  CONSTRAINT nonces_id_key UNIQUE (nonce)
);

GRANT ALL ON TABLE public.nonces TO current_user;

-- Index: public.nonces_nonce_idx

-- DROP INDEX public.nonces_nonce_idx;

CREATE INDEX IF NOT EXISTS nonces_nonce_idx
  ON public.nonces
  USING btree
  (nonce COLLATE pg_catalog."default");
```

## playback_positions

Source: [config/sql/playback_positions.sql](../../config/sql/playback_positions.sql).

```sql
-- Table: public.playback_positions

CREATE TABLE IF NOT EXISTS public.playback_positions
(
    email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    video_id text NOT NULL,
    position_seconds integer NOT NULL CHECK (position_seconds >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (email, video_id)
);

CREATE INDEX IF NOT EXISTS playback_positions_email_updated_idx
    ON public.playback_positions (email, updated_at DESC);

GRANT ALL ON TABLE public.playback_positions TO current_user;
```

## playlist_videos

Source: [config/sql/playlist_videos.sql](../../config/sql/playlist_videos.sql).

```sql
-- Table: public.playlist_videos

-- DROP TABLE public.playlist_videos;

CREATE TABLE IF NOT EXISTS public.playlist_videos
(
    title text,
    id text,
    author text,
    ucid text,
    length_seconds integer,
    published timestamptz,
    plid text references playlists(id),
    index int8,
    live_now boolean,
    members_only boolean NOT NULL DEFAULT false,
    PRIMARY KEY (index,plid)
);

GRANT ALL ON TABLE public.playlist_videos TO current_user;
```

## playlists

Source: [config/sql/playlists.sql](../../config/sql/playlists.sql).

```sql
-- Type: public.privacy

-- DROP TYPE public.privacy;

CREATE TYPE public.privacy AS ENUM
(
    'Public',
    'Unlisted',
    'Private'
);

-- Table: public.playlists

-- DROP TABLE public.playlists;

CREATE TABLE IF NOT EXISTS public.playlists
(
    title text,
    id text primary key,
    author text,
    description text,
    video_count integer,
    created timestamptz,
    updated timestamptz,
    privacy privacy,
    index int8[]
);

GRANT ALL ON public.playlists TO current_user;
```

## saved_playlists

Source: [config/sql/saved_playlists.sql](../../config/sql/saved_playlists.sql).

```sql
CREATE TABLE IF NOT EXISTS public.saved_playlists (
    email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    source_id text NOT NULL,
    metadata text NOT NULL,
    seed_video_id text,
    saved_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (email, source_id)
);
GRANT ALL ON TABLE public.saved_playlists TO current_user;
```

## session_ids

Source: [config/sql/session_ids.sql](../../config/sql/session_ids.sql).

```sql
-- Table: public.session_ids

-- DROP TABLE public.session_ids;

CREATE TABLE IF NOT EXISTS public.session_ids
(
  id text NOT NULL,
  email text,
  issued timestamp with time zone,
  expires_at timestamp with time zone,
  CONSTRAINT session_ids_pkey PRIMARY KEY (id)
);

GRANT ALL ON TABLE public.session_ids TO current_user;

-- Index: public.session_ids_id_idx

-- DROP INDEX public.session_ids_id_idx;

CREATE INDEX IF NOT EXISTS session_ids_id_idx
  ON public.session_ids
  USING btree
  (id COLLATE pg_catalog."default");
```

## tv_pairings

Source: [config/sql/tv_pairings.sql](../../config/sql/tv_pairings.sql).

```sql
-- Grants contain hashes, never plaintext device codes or tokens.
CREATE TABLE IF NOT EXISTS public.tv_pairings (
  device_hash text PRIMARY KEY,
  user_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'denied', 'consumed', 'expired')),
  account_email text REFERENCES public.users(email) ON DELETE SET NULL,
  -- No session FK: logout must not acquire a pairing lock while holding the
  -- session row. Redemption locks account, pairing, then session.
  approving_session text,
  poll_after timestamptz NOT NULL,
  poll_interval integer NOT NULL DEFAULT 5 CHECK (poll_interval >= 5)
);
CREATE INDEX IF NOT EXISTS tv_pairings_expiry_idx ON public.tv_pairings (expires_at);
GRANT ALL ON TABLE public.tv_pairings TO current_user;
```

## users

Source: [config/sql/users.sql](../../config/sql/users.sql).

```sql
-- Table: public.users

-- DROP TABLE public.users;

CREATE TABLE IF NOT EXISTS public.users
(
  updated timestamp with time zone,
  notifications text[],
  subscriptions text[],
  email text NOT NULL,
  preferences text,
  password text,
  token text,
  watched text[],
  feed_needs_update boolean,
  username text NOT NULL,
  credential_version integer NOT NULL DEFAULT 1,
  CONSTRAINT users_email_key UNIQUE (email)
);

GRANT ALL ON TABLE public.users TO current_user;

-- Index: public.email_unique_idx

-- DROP INDEX public.email_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS email_unique_idx
  ON public.users
  USING btree
  (lower(email) COLLATE pg_catalog."default");

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON public.users (lower(username));
```

## videos

Source: [config/sql/videos.sql](../../config/sql/videos.sql).

```sql
-- Table: public.videos

-- DROP TABLE public.videos;

CREATE UNLOGGED TABLE IF NOT EXISTS public.videos
(
  id text NOT NULL,
  info text,
  updated timestamp with time zone,
  CONSTRAINT videos_pkey PRIMARY KEY (id)
);

GRANT ALL ON TABLE public.videos TO current_user;

-- Index: public.id_idx

-- DROP INDEX public.id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS id_idx
  ON public.videos
  USING btree
  (id COLLATE pg_catalog."default");
```

## watch_history

Source: [config/sql/watch_history.sql](../../config/sql/watch_history.sql).

```sql
CREATE TABLE IF NOT EXISTS public.watch_history
(
  email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  video_id text NOT NULL,
  title text,
  channel_name text,
  channel_id text,
  release_date date,
  latest_watched date,
  archived_dates date[] NOT NULL DEFAULT '{}',
  length_seconds integer CHECK (length_seconds > 0),
  PRIMARY KEY (email, video_id)
);
```

