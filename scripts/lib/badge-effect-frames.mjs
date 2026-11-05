export const EFFECTS={ribbon:{duration:1.9},foil:{duration:5.2},interference:{duration:3.2},lenticular:{duration:2.1},afterglow:{duration:4.2}};
export const FPS=20,SIZE=64;
const curves={foil:[[0,0],[.1,.12],[.16,.85],[.23,.2],[.34,0],[1,0]],interference:[[0,0],[.5,.8],[1,0]],lenticular:[[0,0],[.2,0],[.43,.9],[.62,.25],[.78,0],[1,0]],afterglow:[[0,0],[.1,0],[.15,.78],[.35,.3],[.7,.03],[1,0]]};
function ease(x,type){
 if(type==='linear')return x;
 const x1=type==='ease-out'?0:.42,x2=.58;
 const cubic=(t,a,b)=>3*(1-t)**2*t*a+3*(1-t)*t*t*b+t*t*t;
 let lo=0,hi=1;
 for(let i=0;i<32;i++){const t=(lo+hi)/2;if(cubic(t,x1,x2)<x)lo=t;else hi=t;}
 return cubic((lo+hi)/2,0,1);
}
export function opacity(effect,time,phase=0){
 const duration=EFFECTS[effect].duration,p=((time+phase)%duration+duration)%duration/duration,points=curves[effect];
 for(let i=1;i<points.length;i++)if(p<=points[i][0]){
  const [a,v0]=points[i-1],[b,v1]=points[i];
  return v0+(v1-v0)*ease((p-a)/(b-a),effect==='afterglow'?'ease-out':effect==='foil'?'linear':'ease-in-out');
 }
 return 0;
}
const n=value=>Number(value.toFixed(7));
export function frameSvg(effect,time,size=SIZE){
 if(!EFFECTS[effect])throw new RangeError('Unknown effect');
 let body='';
 if(effect==='ribbon')body=`<defs><linearGradient id="light" gradientTransform="matrix(1 0 -.25 1 .125 0)"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset=".43" stop-color="white" stop-opacity="0"/><stop offset=".5" stop-color="white" stop-opacity=".95"/><stop offset=".57" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs><rect x="${n(-72+72*(time%EFFECTS.ribbon.duration)/EFFECTS.ribbon.duration)}" y="0" width="96" height="24" fill="url(#light)"/>`;
 if(effect==='foil')for(let i=0;i<18;i++){
  const x=(Math.floor(i/2)%3)*8,y=Math.floor(i/6)*8,d=i%2?`M${x} ${y} L${x+8} ${y} L${x+8} ${y+8}Z`:`M${x} ${y} L${x} ${y+8} L${x+8} ${y+8}Z`;
  body+=`<path d="${d}" fill="white" opacity="${n(opacity(effect,time,(i*7%18)*5.2/18))}"/>`;
 }
 if(effect==='interference'){
  body='<defs><radialGradient id="light" cx=".3" cy=".35" r=".9">';
  for(let i=0;i<9;i++)body+=`<stop offset="${i/8}" stop-color="white" stop-opacity="${n(opacity(effect,time,i*.26))}"/>`;
  body+='</radialGradient></defs><rect width="24" height="24" fill="url(#light)"/>';
 }
 if(effect==='lenticular'){
  body='<defs><linearGradient id="light"><stop stop-color="white" stop-opacity="0"/><stop offset=".5" stop-color="white" stop-opacity=".85"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs>';
  for(let i=0;i<12;i++)body+=`<rect x="${i*2}" y="0" width="2" height="24" fill="url(#light)" opacity="${n(opacity(effect,time,i*.12))}"/>`;
 }
 if(effect==='afterglow')body=`<rect width="24" height="24" fill="white" opacity="${n(opacity(effect,time))}"/>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="white" stroke="none">${body}</svg>`;
}
