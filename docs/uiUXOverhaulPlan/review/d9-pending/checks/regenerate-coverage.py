from pathlib import Path
import hashlib,json,re
root=Path.cwd(); plan=Path('docs/uiUXOverhaulPlan'); pending=plan/'review/d9-pending'
groups=[
('S01','V01,V30,V35,V36','d8-acceptance.md','template.ecr overhaul/navigation.ecr overhaul/shell.ecr'),
('S02','V02–V06','d8-verification.md','feeds/popular.ecr feeds/trending.ecr search.ecr search_homepage.ecr hashtag.ecr components/item.ecr components/items_paginated.ecr components/browse_controls.ecr overhaul/filter_chip.ecr overhaul/item.ecr overhaul/item_menu.ecr'),
('S03','V07,V20,V25,V27','d6-acceptance.md','channel.ecr channel_search.ecr community.ecr post.ecr components/channel_info.ecr overhaul/comment_config.ecr'),
('S04','V08,V09,V13','d4-acceptance.md','feeds/subscriptions.ecr user/subscription_manager.ecr overhaul/subscribe.ecr'),
('S05','V10,V13,V30','d7-acceptance.md','feeds/history.ecr user/clear_watch_history.ecr overhaul/history_item.ecr'),
('S06','V11–V13,V18','d4-acceptance.md','add_playlist_items.ecr create_playlist.ecr delete_playlist.ecr edit_playlist.ecr playlist.ecr mix.ecr feeds/playlists.ecr overhaul/collection_toolbar.ecr overhaul/selection.ecr overhaul/playlist_fields.ecr overhaul/playlist_reference_actions.ecr'),
('S07','V14–V20,V24–V27,V36','d6-acceptance.md','watch.ecr components/player.ecr components/player_sources.ecr components/video-actions-dialog.ecr overhaul/watch_heading.ecr overhaul/watch_description.ecr overhaul/watch_destinations.ecr overhaul/watch_queue.ecr overhaul/watch_recommendation.ecr overhaul/watch_recommendations.ecr overhaul/watch_transcript.ecr overhaul/watch_comments.ecr'),
('S08','V21,V30','d6-chat-checkpoint.md','overhaul/chat_preferences.ecr overhaul/chat_settings.ecr overhaul/watch_chat.ecr'),
('S09','V22,V23','d6-clips-checkpoint.md','channel_clips.ecr clip_unavailable.ecr create_clip.ecr delete_clip.ecr feeds/clips.ecr components/clip_editor.ecr components/clips.ecr overhaul/clips.ecr overhaul/watch_clip_editor.ecr overhaul/watch_clip_config.ecr'),
('S10','V24–V30','d6-acceptance.md','components/ai-filter-empty.ecr components/ai-filter-status.ecr components/channel_spoiler_scripts.ecr components/dearrow_contributions.ecr user/blocked_channels.ecr user/channel_spoilers.ecr user/dearrow_identity.ecr user/sponsorblock_channels.ecr overhaul/settings.ecr overhaul/settings_navigation.ecr overhaul/settings_legacy_entry.ecr overhaul/ai_filter_matrix.ecr overhaul/sponsorblock_defaults.ecr'),
('S11','V30,V31','d7-account-data-checkpoint.md','user/account.ecr user/authorize_token.ecr user/delete_account.ecr user/login.ecr user/token_manager.ecr'),
('S12','V32','d7-account-data-checkpoint.md','user/data_control.ecr'),
('S13','V33','d7-account-data-checkpoint.md','user/tv_pairing.ecr'),
('S14','V33','d7-verification-checkpoint.md','admin/bot_protection.ecr admin/settings.ecr admin/standalone_shell.ecr verification.ecr'),
('S15','V11,V16,V17,V25,V34','d7-embed-checkpoint.md','embed.ecr'),
('S16','V34,V35','d7-reading-checkpoint.md','error.ecr licenses.ecr message.ecr privacy.ecr overhaul/status_shell.ecr overhaul/standalone_notice.ecr')]
rows=[]
for family,ids,evidence,names in groups:
 for name in names.split():
  path=Path('src/invidious/views')/name
  assert path.is_file(),path
  rows.append(dict(path=str(path),surface=family,verification=ids,evidence='docs/uiUXOverhaulPlan/'+evidence,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
paths=[r['path'] for r in rows]; actual={str(p) for p in Path('src/invidious/views').rglob('*.ecr')}
assert len(set(paths))==len(paths)
assert set(paths)==actual,(actual-set(paths),set(paths)-actual)
p=plan/'coverage.md';s=p.read_text();s=s.replace('The initial source inventory contains 64 ECR files, including partials and standalone shells. Every file is listed explicitly so less-used screens cannot vanish from the overhaul. Add a row when adding/replacing a template; record removals with their replacement in the progress log.','This retained baseline inventory records its original pages and explicit retirements. The final exhaustive table below additionally accounts for all 93 current ECR files; additions cannot silently fall outside a screen family.')
heading='## Final exhaustive template inventory'
if heading in s:s=s[:s.index(heading)]
s+='\n'+heading+'\n\nAll **93** current ECR files are assigned below. Shared rows inherit the owning screen’s access/state contracts. The evidence column identifies direct feature acceptance; every row also participates in the complete [D8 integration](d8-acceptance.md). Source hashes and exact-set validation are retained in [D9 accounting](review/d9-pending/checks/coverage-reconciliation.json).\n\n| Current template | Surface | Verification | Feature evidence |\n| --- | --- | --- | --- |\n'
for row in sorted(rows,key=lambda r:r['path']):
 name=row['path'].removeprefix('src/invidious/views/'); e=row['evidence'].removeprefix('docs/uiUXOverhaulPlan/')
 s+=f"| [{name}](../../{row['path']}) | {row['surface']} | {row['verification']} | [Accepted]({e}) |\n"
p.write_text(s)
# Original baseline rows must still be explicitly present, even after retirement.
baseline=(pending/'baseline/active-docs/docs/uiUXOverhaulPlan/coverage.md.txt').read_text()
original=baseline.split('## Complete template inventory')[1].split('## D1 approved representative components')[0]
original_paths=re.findall(r'\| (?:\[([^]]+\.ecr)\]|`([^`]+\.ecr)`)',original)
base_names=sorted({a or b for a,b in original_paths})
assert all(name in s for name in base_names)
status_rows=[line for line in s.splitlines() if line.startswith('|')]
assert not any(re.search(r'not implemented|pending|in progress',line,re.I) for line in status_rows)
report={'status':'pass','current_template_count':len(rows),'current_templates':sorted(rows,key=lambda r:r['path']),'baseline_inventory_rows':base_names,'baseline_rows_preserved':len(base_names),'screen_families':16,'dynamic_rows':len(s.split('## Dynamic HTML and browser modules')[1].split('## Stylesheet')[0].splitlines())-5,'all_status_rows_reconciled':True}
(pending/'checks').mkdir(parents=True,exist_ok=True)
(pending/'checks/coverage-reconciliation.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS:',len(rows),'current templates;',len(base_names),'baseline rows preserved; no pending status rows')
