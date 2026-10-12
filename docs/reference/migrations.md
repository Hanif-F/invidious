# Database migration inventory

[Documentation index](../README.md)

Generated from [src/invidious/database/migrations](../../src/invidious/database/migrations) by [generate_reference.py](../tools/generate_reference.py). Regenerate after changing the source; do not edit generated tables manually.

Every registered migration runs in its own transaction and records its version in `public.invidious_migrations`. Completed versions are skipped. There is no CLI down/rollback command. See [upgrade and restore](../operations.md).

| Version | Migration | Implementation |
| --- | --- | --- |
| 1 | Create channels table | [src/invidious/database/migrations/0001_create_channels_table.cr](../../src/invidious/database/migrations/0001_create_channels_table.cr) |
| 2 | Create videos table | [src/invidious/database/migrations/0002_create_videos_table.cr](../../src/invidious/database/migrations/0002_create_videos_table.cr) |
| 3 | Create channel videos table | [src/invidious/database/migrations/0003_create_channel_videos_table.cr](../../src/invidious/database/migrations/0003_create_channel_videos_table.cr) |
| 4 | Create users table | [src/invidious/database/migrations/0004_create_users_table.cr](../../src/invidious/database/migrations/0004_create_users_table.cr) |
| 5 | Create session ids table | [src/invidious/database/migrations/0005_create_session_ids_table.cr](../../src/invidious/database/migrations/0005_create_session_ids_table.cr) |
| 6 | Create nonces table | [src/invidious/database/migrations/0006_create_nonces_table.cr](../../src/invidious/database/migrations/0006_create_nonces_table.cr) |
| 7 | Create annotations table | [src/invidious/database/migrations/0007_create_annotations_table.cr](../../src/invidious/database/migrations/0007_create_annotations_table.cr) |
| 8 | Create playlists table | [src/invidious/database/migrations/0008_create_playlists_table.cr](../../src/invidious/database/migrations/0008_create_playlists_table.cr) |
| 9 | Create playlist videos table | [src/invidious/database/migrations/0009_create_playlist_videos_table.cr](../../src/invidious/database/migrations/0009_create_playlist_videos_table.cr) |
| 10 | Make videos unlogged | [src/invidious/database/migrations/0010_make_videos_unlogged.cr](../../src/invidious/database/migrations/0010_make_videos_unlogged.cr) |
| 11 | Create playback positions table | [src/invidious/database/migrations/0011_create_playback_positions_table.cr](../../src/invidious/database/migrations/0011_create_playback_positions_table.cr) |
| 12 | Create blocked channels table | [src/invidious/database/migrations/0012_create_blocked_channels_table.cr](../../src/invidious/database/migrations/0012_create_blocked_channels_table.cr) |
| 13 | Create dearrow identities table | [src/invidious/database/migrations/0013_create_dearrow_identities_table.cr](../../src/invidious/database/migrations/0013_create_dearrow_identities_table.cr) |
| 14 | Create watch history table | [src/invidious/database/migrations/0014_create_watch_history_table.cr](../../src/invidious/database/migrations/0014_create_watch_history_table.cr) |
| 15 | Add members only | [src/invidious/database/migrations/0015_add_members_only.cr](../../src/invidious/database/migrations/0015_add_members_only.cr) |
| 16 | Add history duration | [src/invidious/database/migrations/0016_add_history_duration.cr](../../src/invidious/database/migrations/0016_add_history_duration.cr) |
| 17 | Secure accounts | [src/invidious/database/migrations/0017_secure_accounts.cr](../../src/invidious/database/migrations/0017_secure_accounts.cr) |
| 18 | Create chat timing offsets table | [src/invidious/database/migrations/0018_create_chat_timing_offsets_table.cr](../../src/invidious/database/migrations/0018_create_chat_timing_offsets_table.cr) |
| 19 | Create clips table | [src/invidious/database/migrations/0019_create_clips_table.cr](../../src/invidious/database/migrations/0019_create_clips_table.cr) |
| 20 | Create saved playlists table | [src/invidious/database/migrations/0020_create_saved_playlists_table.cr](../../src/invidious/database/migrations/0020_create_saved_playlists_table.cr) |
| 21 | Create channel avatars table | [src/invidious/database/migrations/0021_create_channel_avatars_table.cr](../../src/invidious/database/migrations/0021_create_channel_avatars_table.cr) |
| 22 | Create ai slist cache | [src/invidious/database/migrations/0022_create_ai_slist_cache.cr](../../src/invidious/database/migrations/0022_create_ai_slist_cache.cr) |
| 23 | Create tv pairings | [src/invidious/database/migrations/0023_create_tv_pairings.cr](../../src/invidious/database/migrations/0023_create_tv_pairings.cr) |
