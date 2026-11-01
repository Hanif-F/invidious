from pathlib import Path
import subprocess,json,hashlib,re
base=Path('docs/uiUXOverhaulPlan/review/d8-pending')
removed=set(subprocess.check_output(['git','diff','--name-only','--diff-filter=D'],text=True).splitlines())
for inventory in ['second-retirement-inventory.json','full-form-retirement-inventory.json']:
    removed.update(row['path'] for row in json.loads((base/'baseline'/inventory).read_text()))
removed=sorted(removed)
runtime=[p for directory in ['src','assets/js','assets/css'] for p in Path(directory).rglob('*') if p.is_file() and p.suffix in ['.cr','.ecr','.js','.css'] and '.min.' not in p.name]
contents={str(p):p.read_text() for p in runtime};entries=[]
for name in removed:
    original=base/'baseline'/name
    assert original.is_file(),name+' has no retained pre-removal source'
    assert not Path(name).exists(),name+' was not removed'
    token=('/'+name.removeprefix('assets/')) if name.startswith('assets/') else name.removeprefix('src/invidious/views/').removesuffix('.ecr')
    matches=[]
    for file,text in contents.items():
        for line_number,line in enumerate(text.splitlines(),1):
            # Exact quoted/browser paths, rather than similarly named settings
            # modules, locale keys or retained POST handler function names.
            if (name.startswith('assets/') and token in line) or (name.endswith('.ecr') and (name in line or re.search(r'[\"\']'+re.escape(token)+r'[\"\']',line))):
                matches.append({'file':file,'line':line_number,'text':line.strip()})
    entries.append({'path':name,'retainedSource':str(original),'retainedSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'runtimeReferences':matches})
forbidden=['ui_overhaul_preview','Desktop.enabled?','player-style-youtube','player-style-invidious','vjs-wide-control','watch-wide','InvidiousRichQualityButton','InvidiousRichAudioButton','js-video-context']
flags=[{'file':file,'token':token} for file,text in contents.items() for token in forbidden if token in text]
foundations=[{'file':file,'line':n,'text':line.strip()} for file,text in contents.items() for n,line in enumerate(text.splitlines(),1) if re.search(r'\b(?:pure-|ion-)|/themes/diary/',line)]
result={'scope':'Current first-party Crystal/ECR/JS/CSS; vendored minified player libraries excluded. Exact retired-file reference scan plus named branch/class scan. Production template/render, normal/API builds and full regressions supplement dynamic-path coverage.','removedFileCount':len(entries),'runtimeFilesScanned':len(runtime),'removedFiles':entries,'retiredBranchReferences':flags,'retiredFoundations':foundations,'retainedCapabilities':['Video.js/plugins, annotations, VR, captions, progressive fallback and licensing','Native/legacy preference fields and ordinary/native API HTML compatibility','POST-only legacy preference and account endpoints','Intentional immutable historical evidence, asset baselines and negative regression assertions']}
assert len(entries)==38,len(entries)
(base/'checks/resumed-2026-11-01-runtime-reference-accounting.json').write_text(json.dumps(result,indent=2)+'\n')
print('Retired files',len(entries),'runtime files',len(runtime),'file references',sum(len(x['runtimeReferences']) for x in entries),'branch references',len(flags),'foundation references',len(foundations))
assert not any(x['runtimeReferences'] for x in entries) and not flags and not foundations
