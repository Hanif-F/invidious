const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const filename=path.resolve(process.argv[2]),source=fs.readFileSync(process.argv[3]||filename,'utf8'),records=[];
const collect=(name,...args)=>{const callback=args.find(value=>typeof value==='function');if(!callback)throw Error(name);const body=callback.toString(),at=source.indexOf(body);if(at<0)throw Error('No source for '+name);const start=source.lastIndexOf('test(',at),tail=source.slice(at+body.length).match(/^\s*\);/);if(!tail)throw Error('Unrecognized test end '+name);records.push({name,start,end:at+body.length+tail[0].length,bodyStart:at,bodyEnd:at+body.length});};
const req=createRequire(filename);
vm.runInNewContext(source,{require:name=>name==='node:test'?{test:collect,before:()=>{},after:()=>{},afterEach:()=>{}}:req(name),__dirname:path.dirname(filename),__filename:filename,process,console,setTimeout,clearTimeout,Buffer,URL,URLSearchParams,structuredClone},{filename});
const families=[...new Map(records.map(row=>[row.start,{...row,names:records.filter(x=>x.start===row.start).map(x=>x.name)}])).values()];
process.stdout.write(JSON.stringify({file:filename,families,registeredCases:records.length},null,2)+'\n');
