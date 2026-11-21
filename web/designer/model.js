export const constructions={
 'lid-base':{name:'Lid & base',title:'The timeless classic.',description:'Two beautifully simple pieces. A lift-off lid and a precisely fitted base.',image:'lid-base.jpg',source:'https://via.lt/dezute-dugnelis-dangtelis/'},
 magnetic:{name:'Magnetic book',title:'A memorable first impression.',description:'A hinged cover, concealed magnetic closure and an opening worth slowing down for.',image:'magnetic.jpg',source:'https://crm.via.lt/shop/magnetic-closure-box-3'},
 shoulder:{name:'Shoulder & neck',title:'It’s all in the reveal.',description:'Three pieces. A contrasting neck. A considered reveal for something exceptional.',image:'shoulder.jpg',source:'https://via.lt/triju-daliu-dezutes/'}
};
export const materials={
 colorplan:{name:'Colorplan',paper:'Colorplan A Shade Plain',texture:'paper',roughness:.88,description:'A fine, tactile decorative paper.'},
 wibalin:{name:'Wibalin',paper:'Wibalin Colours Buckram 115 gsm',texture:'linen',roughness:.9,description:'A woven buckram effect with a tactile surface.'},
 coated:{name:'Printed paper',paper:'Multi-art 150',texture:'smooth',roughness:.56,description:'Coated paper for printed artwork.'},
 kraft:{name:'Natural kraft',paper:'Kraft rudas',texture:'kraft',roughness:1,description:'A natural fibre appearance.'},
 geltex:{name:'Geltex',paper:'Geltex 115 gsm',texture:'linen',roughness:.86,description:'A subtly textured decorative wrap.'}
};
export const defaults={name:'VIA Signature',construction:'magnetic',length:240,width:170,height:70,lidHeight:35,board:2,clearance:.7,neck:12,material:'colorplan',colour:'#652638',inside:'#e8dfcf',foil:'gold',finish:'matte',text:'VIA AQUARIA',subtitle:'PACKAGING YOUR IDEAS',logoScale:1,artwork:null,quantity:1000,hourly:22,margin:25,insert:'none',opening:0,explode:0,dimensions:false,light:'studio',yaw:0,gloss:50,grain:70};
export const studioLooks={signature:{...defaults},nocturne:{...defaults,name:'Nocturne',construction:'lid-base',length:220,width:150,height:60,lidHeight:30,material:'wibalin',colour:'#1f2829',inside:'#eeeeea',foil:'silver'},botanical:{...defaults,name:'Botanical',construction:'shoulder',length:180,width:130,height:65,lidHeight:30,material:'colorplan',colour:'#1d4746',inside:'#b0916a',foil:'gold'}};
export function validate(s){
 const errors=[];
 if(typeof s.name!=='string'||s.name.length<1||s.name.length>80)errors.push('Give the design a name of up to 80 characters.');
 for(const[k,min,max]of [['length',80,500],['width',60,400],['height',25,200],['lidHeight',10,200],['neck',5,30],['quantity',100,1000000],['hourly',1,1000],['margin',0,90],['opening',0,100],['explode',0,100],['logoScale',.4,1.6],['yaw',-180,180],['gloss',0,100],['grain',0,100]])if(typeof s[k]!=='number'||!Number.isFinite(s[k])||s[k]<min||s[k]>max)errors.push(`${k} must be between ${min} and ${max}.`);
 for(const k of ['length','width','height','lidHeight','neck','quantity'])if(!Number.isInteger(s[k]))errors.push(`${k} must be a whole number.`);
 if(!Object.hasOwn(constructions,s.construction))errors.push('Choose a supported construction.');if(!Object.hasOwn(materials,s.material))errors.push('Choose a supported paper.');
 if(!['studio','daylight','night'].includes(s.light))errors.push('Choose a studio lighting preset.');
 if(![1.5,2,2.4,3].includes(s.board))errors.push('Choose a supported board thickness.');
 if(typeof s.clearance!=='number'||s.clearance<.3||s.clearance>2)errors.push('Fit clearance must be 0.3–2 mm.');
 if(s.lidHeight>s.height)errors.push('Lid height must not exceed the base height.');
 if(s.construction==='shoulder'&&s.lidHeight<s.neck+s.board-3)errors.push('Increase lid height so it clears the projecting neck.');
 for(const k of ['colour','inside'])if(!/^#[0-9a-f]{6}$/i.test(s[k]))errors.push('Choose a valid colour.');
 if(!['gold','silver','ink','none'].includes(s.foil)||!['matte','gloss','soft-touch'].includes(s.finish)||!['none','frame'].includes(s.insert))errors.push('Choose a supported finish or insert.');
 if(typeof s.text!=='string'||s.text.length>32||typeof s.subtitle!=='string'||s.subtitle.length>60)errors.push('Artwork text is too long.');
 if(s.artwork!==null&&(typeof s.artwork!=='string'||s.artwork.length>3000000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s.artwork)))errors.push('Artwork must be a PNG image.');
 return errors;
}
export function clean(input){const s={...defaults};for(const k of Object.keys(defaults))if(Object.hasOwn(input??{},k))s[k]=input[k];const errors=validate(s);if(errors.length)throw Error(errors[0]);return s}
// All geometry is in millimetres: X = length, Y = height, Z = width.
// Panels represent board geometry. Paper thickness, glue and production allowances need engineering review.
export function panels(s){
 const L=s.length,W=s.width,H=s.height,T=s.board,C=s.clearance,D=s.lidHeight;
 const out=[];const add=(name,size,center,group='base',surface='outer')=>out.push({name,size,center,group,surface});
 function tray(prefix,l,w,h,y,group,down=false,surface='outer'){
  add(prefix+' floor',[l,T,w],[0,y+(down?h-T/2:T/2),0],group,surface);
  add(prefix+' front',[l,h-T,T],[0,y+(down?(h-T)/2:T+(h-T)/2),w/2-T/2],group,surface);
  add(prefix+' back',[l,h-T,T],[0,y+(down?(h-T)/2:T+(h-T)/2),-w/2+T/2],group,surface);
  add(prefix+' left',[T,h-T,w-2*T],[-l/2+T/2,y+(down?(h-T)/2:T+(h-T)/2),0],group,surface);
  add(prefix+' right',[T,h-T,w-2*T],[l/2-T/2,y+(down?(h-T)/2:T+(h-T)/2),0],group,surface);
 }
 if(s.construction==='magnetic'){
  tray('Tray',L,W,H,T,'base');
  const l=L+2*T+2*C,w=W+2*T+2*C;
  add('Lower cover',[l,T,w],[0,T/2,0]);
  add('Cover spine',[l,H+T,T],[0,T+(H+T)/2,-w/2+T/2]);
  // Lid group coordinates are local to the rear hinge, at the top of the spine.
  add('Hinged cover',[l,T,w],[0,T/2,w/2],'lid');
  add('Magnetic closing flap',[l,H*.4,T],[0,-H*.2,w-T/2],'lid');
 }else if(s.construction==='shoulder'){
  tray('Base',L,W,H,0,'base');
  const l=L-2*T-2*C,w=W-2*T-2*C,h=H+s.neck-T;
  add('Neck front',[l,h,T],[0,T+h/2,w/2-T/2],'neck','inside');
  add('Neck back',[l,h,T],[0,T+h/2,-w/2+T/2],'neck','inside');
  add('Neck left',[T,h,w-2*T],[-l/2+T/2,T+h/2,0],'neck','inside');
  add('Neck right',[T,h,w-2*T],[l/2-T/2,T+h/2,0],'neck','inside');
  tray('Lid',L,W,D,0,'lid',true);
 }else{tray('Base',L,W,H,0,'base');tray('Lid',L+2*T+2*C,W+2*T+2*C,D,0,'lid',true)}
 if(s.insert==='frame'){
  const [il,iw]=innerDimensions(s);const l=il-2,w=iw-2,h=H*.35,b=Math.min(l,w)*.15,y=(s.construction==='magnetic'?T:0)+T+h/2;
  add('Insert front',[l,h,b],[0,y,w/2-b/2],'insert','foam');add('Insert back',[l,h,b],[0,y,-w/2+b/2],'insert','foam');
  add('Insert left',[b,h,w-2*b],[-l/2+b/2,y,0],'insert','foam');add('Insert right',[b,h,w-2*b],[l/2-b/2,y,0],'insert','foam');
 }
 return out;
}
export function lidTransform(s,opening=s.opening/100){
 if(s.construction==='magnetic')return {position:[0,s.height+2*s.board,-(s.width+2*s.board+2*s.clearance)/2],angle:-opening*Math.PI*.64};
 return {position:[0,(s.construction==='shoulder'?s.height+3:s.height-s.lidHeight+s.board+s.clearance)+opening*(s.height*.9+35),0],angle:0};
}
export function closedPanels(s){const tr=lidTransform(s,0);return panels(s).map(p=>({...p,center:p.group==='lid'?p.center.map((v,i)=>v+tr.position[i]):p.center}))}
export function innerDimensions(s){const extra=s.construction==='shoulder'?2*s.board+2*s.clearance:0;return [s.length-2*s.board-extra,s.width-2*s.board-extra,s.height-s.board]}
export function quoteRequest(s,catalog){
 const board=Object.values(catalog.J7.options).find(v=>new RegExp(`(^|[^0-9])${String(s.board).replace('.','[.,]')}\\s*mm`,'i').test(v));
 const box={C7:materials[s.material].paper,C8:materials[s.material].paper,J7:board||catalog.J7.value,J9:board||catalog.J9.value};
 const foilArea=Math.min(s.length*.62*s.logoScale,s.length*.85)*Math.min(s.width*.32*s.logoScale,s.width*.6)/100;
 box.C27=s.foil==='gold'||s.foil==='silver'?(foilArea<100?'< 100cm2':foilArea<=300?'100-300cm2':'> 300cm2'):catalog.C27.value;
 const options=catalog.C26.options;box.C26=s.finish==='gloss'?'taip':s.finish==='soft-touch'?(options.find(x=>/soft/i.test(x))??'ne'):'ne';
 const supported=s.construction==='lid-base'&&s.insert==='none'&&Boolean(board)&&catalog.C7.options.includes(box.C7)&&catalog.C8.options.includes(box.C8);
 return {supported,request:{guided:true,quantity:s.quantity,length_mm:s.length,width_mm:s.width,base_height_mm:s.height,lid_height_mm:s.lidHeight,hourly_rate:s.hourly,margin_percent:s.margin,production:'auto',include_shipping:false,compare_quantities:[500,1000,2000],box}};
}
export function brief(s,quote=null){return {schema:'via-packaging-studio/1',created_at:new Date().toISOString(),status:'design_request_draft',construction:constructions[s.construction].name,configuration:s,inner_dimensions_mm:innerDimensions(s),board_panels:closedPanels(s),estimate:quote,notes:['Concept geometry; paper, glue, fit and manufacturing allowances require VIA engineering confirmation.','Colours and textures are screen simulations, not approved physical swatches.','This draft is not a placed order.']}}
