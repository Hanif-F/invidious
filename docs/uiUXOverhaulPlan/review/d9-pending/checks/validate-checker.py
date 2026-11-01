from pathlib import Path
import importlib.util, tempfile, contextlib, io, json
spec=importlib.util.spec_from_file_location('docs_checker','docs/tools/check_docs.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
results=[]
with tempfile.TemporaryDirectory(prefix='invidious-d9-doccheck-') as directory:
 root=Path(directory);docs=root/'docs';(docs/'tools').mkdir(parents=True)
 (docs/'tools/generate_reference.py').write_text('raise SystemExit(0)\n')
 (root/'README.md').write_text('[API](docs/api.md#kept-anchor)\n')
 (docs/'README.md').write_text('[API](api.md)\n')
 (docs/'api.md').write_text('# API\n<a id="kept-anchor"></a>\n')
 m.ROOT=root;m.DOCS=docs;m.EXTRA_DOCS=('README.md',)
 def run(label,expected,fragment):
  out=io.StringIO();err=io.StringIO()
  with contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):result=m.main()
  assert result==expected,(label,result,out.getvalue(),err.getvalue())
  assert fragment in out.getvalue()+err.getvalue(),(label,fragment)
  results.append({'case':label,'expected_exit':expected,'actual_exit':result,'diagnostic':out.getvalue()+err.getvalue()})
 run('root guide link to explicit HTML anchor',0,'Checked 3 Markdown')
 (root/'README.md').write_text('[Missing](gone.md)\n');run('missing root target fails',1,'missing link gone.md')
 (root/'README.md').write_text('[Missing](docs/api.md#gone)\n');run('missing root fragment fails',1,'missing anchor docs/api.md#gone')
 (root/'README.md').write_text('[API](docs/api.md#kept-anchor)\n```sh\n');run('unclosed root fence fails',1,'unclosed code fence')
 (root/'README.md').write_text('[API](docs/api.md#kept-anchor)\n');(docs/'orphan.md').write_text('# Orphan\n');run('unreachable handbook page fails',1,'unreachable from docs/README.md')
 (docs/'orphan.md').unlink();(docs/'tools/generate_reference.py').write_text('raise SystemExit(1)\n');run('generated-reference drift fails',1,'Generated reference check failed')
Path('docs/uiUXOverhaulPlan/review/d9-pending/checks/checker-validation.json').write_text(json.dumps({'status':'pass','cases':results,'limits':'Isolated negative checks use a no-op generator; real seven-reference validation runs separately against the full repository.'},indent=2)+'\n')
print('PASS: six checker boundary cases')
