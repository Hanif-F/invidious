from pathlib import Path
import json, os, subprocess, tempfile, yaml
root=Path.cwd();path=root/'.github/workflows/documentation.yml'
data=yaml.load(path.read_text(),Loader=yaml.BaseLoader)
assert data['on']==['push','pull_request']
assert data['permissions']=={'contents':'read'}
steps=data['jobs']['handbook']['steps']
assert steps[0]['with']=={'fetch-depth':'0','persist-credentials':'false'}
assert steps[1]['run']=='python3 docs/tools/check_docs.py'
assert 'pull_request.base.sha' in steps[2]['env']['DOCUMENTATION_BASE']
script=steps[2]['run'];cases=[]
with tempfile.TemporaryDirectory(prefix='invidious-d9-workflow-') as directory:
 def git(*args):
  return subprocess.run(['git','-c','user.name=Documentation fixture','-c','user.email=documentation@example.invalid',*args],cwd=directory,text=True,capture_output=True,check=True).stdout.strip()
 git('init','--quiet');p=Path(directory)/'guide.md';p.write_text('# Guide\n');git('add','guide.md');git('commit','--quiet','-m','Clean fixture');first=git('rev-parse','HEAD')
 p.write_text('# Guide\n\nValid text.\n');git('add','guide.md');git('commit','--quiet','-m','Clean update');second=git('rev-parse','HEAD')
 p.write_text('# Guide\n\nInvalid trailing space. \n');git('add','guide.md');git('commit','--quiet','-m','Intentional whitespace failure fixture');third=git('rev-parse','HEAD')
 for name,base,head,want_success in [('clean PR/push range',first,second,True),('bad PR/push range',second,third,False),('first commit fallback clean','',first,True),('zero before fallback bad','0'*40,third,False),('unavailable base fallback bad','1'*40,third,False)]:
  env=dict(os.environ,DOCUMENTATION_BASE=base,DOCUMENTATION_HEAD=head)
  result=subprocess.run(['bash','-e','-c',script],cwd=directory,env=env,capture_output=True,text=True)
  assert (result.returncode==0)==want_success,(name,result)
  cases.append({'case':name,'exit_code':result.returncode,'expected_success':want_success,'output':result.stdout+result.stderr})
report={'status':'pass','workflow':str(path.relative_to(root)),'cases':cases,'scope':'YAML/trigger/permission checks and actual whitespace shell executed in an isolated temporary Git fixture; no application, external access or current checkout Git mutation.'}
(root/'docs/uiUXOverhaulPlan/review/d9-pending/checks/workflow-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: workflow structure and five real clean/failing range/fallback checks')
