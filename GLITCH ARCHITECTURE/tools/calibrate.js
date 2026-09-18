global.window=global; global.localStorage={getItem:()=>null,setItem:()=>{}};
global.fetch=()=>Promise.reject(new Error('x'));
global.AbortController=class{constructor(){this.signal={}}abort(){}};
require('../assets/js/core.js');
const GA=global.GA;
// sample mean phi per model across global points & hours
const models=GA.MODELS;
const stats={};
for(const k in models) stats[k]=[];
let n=0;
for(let i=0;i<1200;i++){
  const lat=(Math.random()*140)-60, lon=(Math.random()*360)-180, h=Math.floor(Math.random()*7);
  const atm=GA.sampleAtmosphere(lat,lon,h,{});
  for(const k in models){
    const m=models[k];
    let s=0; m.features.forEach(f=>s+=f.w*Math.max(0,Math.min(1,f.phi(atm))));
    stats[k].push(s/m.totalWeight);
  }
  n++;
}
for(const k in stats){
  const a=stats[k].sort((x,y)=>x-y);
  const q=p=>a[Math.floor(p*a.length)].toFixed(3);
  console.log(k,'W',models[k].totalWeight.toFixed(2),'p10',q(.1),'p50',q(.5),'p75',q(.75),'p90',q(.9),'p98',q(.98),'max',a[a.length-1].toFixed(3));
}
