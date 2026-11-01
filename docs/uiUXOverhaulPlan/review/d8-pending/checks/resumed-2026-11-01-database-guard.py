import json, subprocess, sys
from pathlib import Path
container = 'invidious-ui-overhaul-01a176a0-d8-final'
expected = '9f3a957dd9216ff11365e8ee0463145168bcf7912d262f35ab809e10bac4d21c'
meta = json.loads(subprocess.check_output(['docker','inspect',container],text=True))[0]
assert meta['Id'] == expected and meta['State']['Running']
assert meta['Config']['Labels']['codex.task'] == '01a176a0-bf7a-71b0-af8d-2955647ae8f0'
assert meta['Config']['Labels']['codex.stage'] == 'd8-final'
assert meta['Image'] == 'sha256:c2427de38f998489d36de7ca3553db2134872c400f2b08be4b824e5c50e4d619'
assert meta['NetworkSettings']['Ports'] == {'5432/tcp':[{'HostIp':'127.0.0.1','HostPort':'32768'}]}
def sql(query):
    return subprocess.check_output(['docker','exec',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','invidious_accounts_test','-At','-c',query],text=True).strip()
assert sql('SELECT current_database()') == 'invidious_accounts_test'
assert sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()") == '0'
assert sql("SHOW server_version").startswith('14.')
tables=sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
mode=sys.argv[1]
if mode=='empty': assert tables==[],tables
elif mode=='final':
    assert tables==['auth_rate_limits','saved_playlists','session_ids','tv_pairings','users'],tables
    for table in tables: assert sql('SELECT count(*) FROM '+table)=='0',table
else: raise AssertionError('Unknown guard mode')
print(json.dumps({'containerId':expected,'taskLabel':meta['Config']['Labels']['codex.task'],'database':'invidious_accounts_test','binding':'127.0.0.1:32768','mode':mode,'tables':tables,'otherClients':0},sort_keys=True))
