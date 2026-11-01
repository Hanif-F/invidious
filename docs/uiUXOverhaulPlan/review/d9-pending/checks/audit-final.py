from pathlib import Path
import hashlib,json,re,subprocess
root=Path.cwd();base=Path('docs/uiUXOverhaulPlan/review/d9-pending');sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
protected=json.loads((base/'baseline/protected-review-sha256.json').read_text());d8=json.loads(Path('docs/uiUXOverhaulPlan/review/d8-evidence.json').read_text())
for label,items in [('protected review',protected),('D8 source',d8['sourceSha256'])]:
 changed=[p for p,h in items.items() if not Path(p).is_file() or sha(p)!=h];assert not changed,(label,changed)
coverage=Path('docs/uiUXOverhaulPlan/coverage.md').read_text();inventory=json.loads((base/'checks/coverage-reconciliation.json').read_text())
current={str(p) for p in Path('src/invidious/views').rglob('*.ecr')};rows=inventory['current_templates'];assert {r['path'] for r in rows}==current
for r in rows:assert sha(r['path'])==r['sha256'] and r['path'] in coverage and Path(r['evidence']).is_file()
assert all(name in coverage for name in inventory['baseline_inventory_rows'])
for line in coverage.splitlines():
 if line.startswith('|'):assert not re.search(r'not implemented|pending|in progress',line,re.I),line
family_section=coverage.split('## Screen families')[1].split('## State and persistence ownership')[0]
assert set(re.findall(r'^\| (S\d+) \|',family_section,re.M))=={f'S{i:02}' for i in range(1,17)}
dynamic=coverage.split('## Dynamic HTML and browser modules')[1].split('## Stylesheet')[0]
inventory['dynamic_rows']=len([s for s in dynamic.splitlines() if s.startswith('|')])-2
(base/'checks/coverage-reconciliation.json').write_text(json.dumps(inventory,indent=2)+'\n')
semantic=Path('docs/uiUXOverhaulPlan/d9-semantic-audit.md').read_text();guides={p.name for p in Path('docs').glob('*.md')}
assert all(f'../{name}' in semantic for name in guides),guides
package=json.loads(Path('tests/frontend/package.json').read_text());suites=re.findall(r'[^ ]+\.test\.cjs',package['scripts']['test']);testguide=Path('tests/frontend/README.md').read_text()
assert len(suites)==17 and all(Path('tests/frontend',p).is_file() and p in testguide for p in suites)
vaudit=Path('docs/uiUXOverhaulPlan/d8-verification.md').read_text();assert set(re.findall(r'^\| (V\d+) \|',vaudit,re.M))=={f'V{i:02}' for i in range(1,37)}
requirements=Path('docs/uiUXOverhaulPlan/d9-requirement-audit.md').read_text();assert set(re.findall(r'^\| (D\d) \|',requirements,re.M))=={f'D{i}' for i in range(10)}
assert set(re.findall(r'^\| (\d)\.',requirements,re.M))==set('123456789')
# Whitespace for active D9 scope includes new files that git diff cannot see.
snapshots=json.loads((base/'baseline/active-docs-sha256.json').read_text())
paths={r['path'] for r in snapshots}|{'.github/workflows/documentation.yml','docs/tools/check_docs.py','docs/uiUXOverhaulPlan/progress.md','docs/uiUXOverhaulPlan/visual-checkpoint.md'}
paths.update(str(p) for p in Path('docs/uiUXOverhaulPlan').glob('d9-*.md'));paths.add('docs/uiUXOverhaulPlan/user-handoff.md');paths.update(str(p) for p in Path('docs/reference').glob('*.md'))
errors=[]
for name in paths:
 data=Path(name).read_bytes()
 if data and not data.endswith(b'\n'):errors.append((name,'missing final newline'))
 for i,line in enumerate(data.splitlines(),1):
  if line.rstrip(b' \t')!=line:errors.append((name,i,'trailing whitespace'))
assert not errors,errors
ignored=subprocess.run(['git','check-ignore','--stdin'],input='\n'.join(sorted(paths))+'\n',text=True,capture_output=True)
assert ignored.returncode==1 and not ignored.stdout,(ignored.returncode,ignored.stdout,ignored.stderr)
for name in ['docs/tools/check_docs.py','docs/tools/generate_reference.py']:compile(Path(name).read_text(),name,'exec')
report={'status':'pass','prior_review_files_unchanged':len(protected),'accepted_D8_source_files_unchanged':len(d8['sourceSha256']),'current_templates_exactly_mapped':len(current),'baseline_template_rows_preserved':len(inventory['baseline_inventory_rows']),'surface_families':16,'dynamic_rows_reconciled':inventory['dynamic_rows'],'handbook_pages_semantically_mapped':len(guides),'declared_suites_mapped':len(suites),'verification_rows':36,'task_stages':10,'final_criteria':9,'active_files_whitespace_checked_and_not_ignored':len(paths),'runtime_or_tests_modified_since_D8':[]}
(base/'checks/final-conservation-and-accounting.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
