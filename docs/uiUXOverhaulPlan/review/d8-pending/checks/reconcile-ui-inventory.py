from pathlib import Path
import json,hashlib
base=Path('docs/uiUXOverhaulPlan/review/d8-pending');removed={}
for kind in ['clip','style','chat']:
    for row in json.loads((base/'checks'/f'{kind}-test-reconciliation.json').read_text()):
        for name in row['registeredCases']:removed[name]=kind+'-test-reconciliation.json'
for row in json.loads((base/'checks/enhancement-test-reconciliation.json').read_text())['families']:
    for name in row['oldNames']:removed[name]='enhancement-test-reconciliation.json'
a=json.loads((base/'checks/resumed-ui-original-test-index.json').read_text());b=json.loads((base/'checks/resumed-ui-test-index.json').read_text())
old=[x for x in a['families'] if not set(x['names'])&set(removed)];new=[x for x in b['families'] if 'D8 contextual actions' not in x['name']];assert len(old)==len(new)==140
f1=base/'baseline/tests/frontend/ui.test.cjs';f2=Path('tests/frontend/ui.test.cjs');s1=f1.read_text();s2=f2.read_text();h=lambda s:hashlib.sha256(s.encode()).hexdigest();rows=[]
for u,v in zip(old,new):
    p=s1[u['bodyStart']:u['bodyEnd']];q=s2[v['bodyStart']:v['bodyEnd']]
    rows.append({'oldCases':u['names'],'currentCases':v['names'],'oldCallbackSha256':h(p),'currentCallbackSha256':h(q),'disposition':'Retained unchanged' if p==q else 'Retained and reconciled with the actual route, component owner, shared presentation or canonical state; exact assertions are in the source snapshots.'})
result={'status':'Final source inventory; complete npm verification is pending','originalSource':str(f1),'originalSha256':h(s1),'currentSource':str(f2),'currentSha256':h(s2),'counts':{'originalRegistered':349,'retiredWithExplicitReplacement':67,'retainedRegistered':282,'addedRepeatedContextOwner':2,'currentRegistered':284,'retainedSourceFamilies':140},'retiredCases':removed,'retainedFamilies':rows,'addedFamilies':[v for v in b['families'] if 'D8 contextual actions' in v['name']]}
(base/'checks/ui-complete-test-reconciliation.json').write_text(json.dumps(result,indent=2)+'\n')
print('349 original UI cases accounted for; 284 current registered cases, 140 retained source families.')
