const fs=require('fs');eval(fs.readFileSync(__dirname+'/data.js','utf8')+';global.Q=SEED_QUESTIONS;global.D=SEED_DOMAINS;');
let bad=0;const per={};
for(const q of Q){const errs=[];
 if(q.questionText.length>120)errs.push('q>120 ('+q.questionText.length+')');
 if(q.options.length<4||q.options.length>5)errs.push('opt count');
 q.options.forEach(o=>{if(o.trim().split(/\s+/).length>4||o.length>28)errs.push('opt "'+o+'"')});
 if(!(q.correctIndex>=0&&q.correctIndex<q.options.length))errs.push('correct');
 if(new Set(q.options).size!==q.options.length)errs.push('dup opt');
 if(![1,2,3].includes(q.difficulty))errs.push('diff');
 if(!q.source.startsWith('TEST'))errs.push('source');
 if(!D.find(d=>d.id===q.domainId))errs.push('domain');
 per[q.domainId]=per[q.domainId]||{n:0,d:[],o:new Set()};per[q.domainId].n++;per[q.domainId].d.push(q.difficulty);per[q.domainId].o.add(q.options.length);
 if(errs.length){bad++;console.log(q.id,errs)}}
for(const k in per)console.log(k,per[k].n,per[k].d.sort().join(''),[...per[k].o].join('/'));
console.log(bad?'FAIL':'ALL VALID',Q.length);process.exit(bad?1:0);
