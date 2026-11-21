import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {panels,lidTransform} from './model.js';
import {resolveRenderSpec} from './render-spec.js';
import {StudioLight} from './studio-light.js';
import {SurfaceMaterials,scalePanelUVs} from './surface-materials.js';

const mm=.001;
export class BoxViewer{
 constructor(container){
  this.container=container;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#f1f1ef');
  this.camera=new THREE.PerspectiveCamera(32,1,.001,30);this.camera.position.set(.42,.34,.5);
  this.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor('#f1f1ef');
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;container.append(this.renderer.domElement);
  this.studioLight=new StudioLight(this.scene,this.renderer);
  this.surfaceMaterials=new SurfaceMaterials(this.renderer);
  this.studioLight.setPreset('studio');
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.minDistance=.18;this.controls.maxDistance=2.5;this.controls.maxPolarAngle=Math.PI*.49;this.controls.target.set(0,.055,0);this.controls.enablePan=true;
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.ShadowMaterial({opacity:.24}));floor.rotation.x=-Math.PI/2;floor.position.y=-.001;floor.receiveShadow=true;this.scene.add(floor);
  this.contact = this.makeContactShadow();
  this.scene.add(this.contact);
  this.root=new THREE.Group();this.scene.add(this.root);this.measurements=new THREE.Group();this.scene.add(this.measurements);this.targetOpen=0;this.currentOpen=0;this.autoRotate=false;this.autoCamera=true;this.autoZoomFactor=1;this.last=performance.now();
  this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
  this.renderer.domElement.addEventListener('pointerdown',e=>{this.pointerStart={x:e.clientX,y:e.clientY}});
  this.renderer.domElement.addEventListener('pointermove',e=>{if(e.buttons){if(this.pointerStart&&Math.hypot(e.clientX-this.pointerStart.x,e.clientY-this.pointerStart.y)>6)this.autoCamera=false;return}const hit=this.pick(e);this.renderer.domElement.style.cursor=hit?'pointer':'grab';this.renderer.domElement.title=hit?(this.isLid(hit.object)?'Click the lid to open or close it':'Click to inspect '+hit.object.name):'Drag to orbit the box'});
  this.renderer.domElement.addEventListener('wheel',()=>this.autoCamera=false,{passive:true});
  this.renderer.domElement.addEventListener('pointerup',e=>{if(!this.pointerStart||Math.hypot(e.clientX-this.pointerStart.x,e.clientY-this.pointerStart.y)>6)return;const hit=this.pick(e);if(!hit){this.clearSelection();return}this.selectPart(hit.object);if(this.isLid(hit.object))container.dispatchEvent(new CustomEvent('lidtoggle',{detail:{opening:this.targetOpen>.5?0:100}}))});
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();this.frame=this.frame.bind(this);this.frame();
 }
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;const old=Math.max(1,1.45/this.camera.aspect);this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(this.state&&this.controls){const ratio=Math.max(1,1.45/this.camera.aspect)/old;this.camera.position.sub(this.controls.target).multiplyScalar(ratio).add(this.controls.target)}}
 disposeModel(){this.clearSelection();this.root.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of [].concat(o.material))if(!this.shared?.includes(m)){m.map?.dispose();m.alphaMap?.dispose();m.dispose()}});this.root.clear();this.measurements.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose()});this.measurements.clear();for(const m of this.shared??[])m.dispose();}
 makeContactShadow() {
  const size = 128;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(0, Math.abs(x / size - .5) - .34);
      const dy = Math.max(0, Math.abs(y / size - .5) - .34);
      rgba[(y * size + x) * 4 + 3] = Math.round(78 * Math.exp(-((dx * dx + dy * dy) / .0026)));
    }
  }
  const texture = new THREE.DataTexture(rgba, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({map: texture, transparent: true, depthWrite: false}),
  );
  mesh.rotation.order = 'YXZ';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -.0007;
  mesh.visible = false;
  return mesh;
 }
 async update(s,{fit=false}={}){
  s = this.pendingState = structuredClone(s);
  const rev = this.revision = (this.revision ?? 0) + 1;
  const {surfaces} = resolveRenderSpec(s);
  const [outer, inside, foam] = await Promise.all([
    this.surfaceMaterials.build(surfaces.outside),
    this.surfaceMaterials.build(surfaces.lining),
    this.surfaceMaterials.build(surfaces.foam),
  ]);
  if (rev !== this.revision) {
    for (const material of [outer, inside, foam]) material.dispose();
    return;
  }
  this.state = structuredClone(s);
  this.disposeModel();
  this.shared = [outer, inside, foam];
  this.lighting(s.light);
  if (!this.autoRotate) this.root.rotation.y = THREE.MathUtils.degToRad(s.yaw);
  const extra = s.construction === 'magnetic' ? 2 * (s.board + s.clearance) : 0;
  this.contact.scale.set((s.length + extra) * mm / .68, (s.width + extra) * mm / .68, 1);
  this.contact.visible = true;
  const profile = new Map([[outer, surfaces.outside], [inside, surfaces.lining], [foam, surfaces.foam]]);
  this.groups={base:new THREE.Group(),lid:new THREE.Group(),neck:new THREE.Group(),insert:new THREE.Group()};for(const[n,g]of Object.entries(this.groups)){g.name=n;this.root.add(g)}
  for(const p of panels(s)){
   const surface=p.surface==='foam'?foam:p.surface==='inside'?inside:outer;const faces=Array(6).fill(surface);
   if(p.surface==='outer'){
    if(p.name.endsWith('floor'))faces[p.group==='lid'?3:2]=inside;
    if(p.name.endsWith('front'))faces[5]=inside;if(p.name.endsWith('back'))faces[4]=inside;if(p.name.endsWith('left'))faces[0]=inside;if(p.name.endsWith('right'))faces[1]=inside;
    if(p.name==='Hinged cover')faces[3]=inside;
   }
   const radius = p.surface === 'foam' ? .65 : Math.min(s.board * .18, .42);
   const geometry = new RoundedBoxGeometry(...p.size.map(v=>v*mm), 2, radius * mm);
   scalePanelUVs(geometry, p.size, faces.map(face => profile.get(face)));
   const mesh=new THREE.Mesh(geometry,faces);mesh.name=p.name;mesh.position.fromArray(p.center.map(v=>v*mm));mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={dimensions_mm:p.size};this.groups[p.group].add(mesh);
  }
  this.targetOpen=s.opening/100;this.currentOpen=this.targetOpen;this.pose();this.addMeasurements();
  if(fit)this.resetCamera();
  await this.addArtwork(rev, surfaces.foil);this.draw();
 }
 async addArtwork(rev, foilProfile){const s=this.state;if(s.foil==='none'&&!s.artwork)return;const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=768;const ctx=canvas.getContext('2d');
  if(s.artwork){try{const bytes=Uint8Array.from(atob(s.artwork.split(',')[1]),c=>c.charCodeAt(0));const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));if(rev!==this.revision){image.close();return}const scale=Math.min(1300/image.width,560/image.height);ctx.drawImage(image,(1536-image.width*scale)/2,(768-image.height*scale)/2,image.width*scale,image.height*scale);image.close()}catch{return}}
  else{await document.fonts.ready;if(rev!==this.revision)return;ctx.fillStyle='white';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='500 114px Montserrat';const width=ctx.measureText(s.text).width;const size=Math.min(114,1320/Math.max(width,1)*114);ctx.font=`500 ${size}px Montserrat`;ctx.fillText(s.text,768,335);ctx.font='500 27px Montserrat';ctx.letterSpacing='5px';ctx.fillText(s.subtitle,768,460);ctx.lineWidth=2;ctx.strokeStyle='white';ctx.beginPath();ctx.moveTo(650,535);ctx.lineTo(886,535);ctx.stroke()}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(this.renderer.capabilities.getMaxAnisotropy(),8);
  const foil = !s.artwork && ['gold','silver'].includes(s.foil);
  const material = foil ? await this.surfaceMaterials.foil(foilProfile, texture) :
    new THREE.MeshStandardMaterial({map: texture, color: s.artwork ? 'white' : '#191919', roughness: .8, alphaTest: .18});
  if (rev !== this.revision) {
    material.dispose();
    texture.dispose();
    return;
  }
  const w=Math.min(s.length*.62*s.logoScale,s.length*.85),d=Math.min(s.width*.32*s.logoScale,s.width*.6);
  const geometry = new THREE.PlaneGeometry(w * mm, d * mm);
  if (foil) {
    const uv = geometry.getAttribute('uv').clone();
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / foilProfile.tileMm, uv.getY(i) * d / foilProfile.tileMm);
    geometry.setAttribute('uv1', uv);
  }
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Artwork visual preview';mesh.rotation.x=-Math.PI/2;
  const magnetic=s.construction==='magnetic';mesh.position.set(0,(magnetic?s.board:s.lidHeight)*mm+.00012,magnetic?(s.width+2*s.board+2*s.clearance)*mm/2:0);mesh.renderOrder=3;this.groups.lid.add(mesh);
 }
 pose(){if(!this.state)return;const s=this.state,t=lidTransform(s,this.currentOpen);this.groups.lid.position.fromArray(t.position.map(v=>v*mm));this.groups.lid.rotation.x=t.angle;
  const ex=s.explode/100;this.groups.lid.position.y+=ex*.1;this.groups.neck.position.y=ex*.04;this.groups.insert.position.y=ex*.06;this.groups.base.position.y=0;
  if(this.autoCamera){const target=this.frameHeight(),delta=target-this.controls.target.y;this.controls.target.y=target;this.camera.position.y+=delta;const zoom=this.frameZoom();this.camera.position.sub(this.controls.target).multiplyScalar(zoom/this.autoZoomFactor).add(this.controls.target);this.autoZoomFactor=zoom}
  this.measurements.visible=s.dimensions;
 }
 addMeasurements(){const s=this.state,L=s.length*mm,W=s.width*mm,H=s.height*mm;const color=0x8b4856;const lines=[[[ -L/2,.002,W/2+.025],[L/2,.002,W/2+.025],`${s.length} mm`],[[-L/2-.025,.002,-W/2],[-L/2-.025,.002,W/2],`${s.width} mm`],[[L/2+.025,0,W/2],[L/2+.025,H,W/2],`${s.height} mm`]];
  for(const[a,b,text]of lines){const p1=new THREE.Vector3(...a),p2=new THREE.Vector3(...b);const geometry=new THREE.BufferGeometry().setFromPoints([p1,p2]);this.measurements.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color})));for(const p of [p1,p2]){const ball=new THREE.Mesh(new THREE.SphereGeometry(.0012,8,8),new THREE.MeshBasicMaterial({color}));ball.position.copy(p);this.measurements.add(ball)}const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,256,64);x.fillStyle='#6c3542';x.textAlign='center';x.font='500 28px sans-serif';x.fillText(text,128,43);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));sprite.position.copy(p1.clone().lerp(p2,.5));sprite.position.y+=.009;sprite.scale.set(.062,.0155,1);this.measurements.add(sprite)}
 }
 setOpening(n){this.autoCamera=true;this.targetOpen=n/100;if(this.pendingState)this.pendingState.opening=n;if(this.state)this.state.opening=n}
 setExplode(n){if(this.pendingState)this.pendingState.explode=n;if(this.state)this.state.explode=n;this.pose()}
 setDimensions(on){if(this.pendingState)this.pendingState.dimensions=on;if(this.state)this.state.dimensions=on;this.pose()}
 pick(event){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);return this.raycaster.intersectObject(this.root,true).find(hit=>hit.object.isMesh)}
 isLid(object){for(let o=object;o;o=o.parent)if(o===this.groups.lid)return true;return false}
 selectPart(object){this.clearSelection();this.selectedPart=object;this.selectionBox=new THREE.BoxHelper(object,0xa75e72);this.selectionBox.material.depthTest=false;this.selectionBox.renderOrder=5;this.scene.add(this.selectionBox);this.container.dispatchEvent(new CustomEvent('partselect',{detail:{name:object.name,size:object.userData.dimensions_mm??null,group:this.isLid(object)?'lid':'base'}}))}
 clearSelection(){if(this.selectionBox){this.scene.remove(this.selectionBox);this.selectionBox.dispose();this.selectionBox=null}this.selectedPart=null;this.container.dispatchEvent(new CustomEvent('partselect',{detail:null}))}
 lighting(mode){this.studioLight.setPreset(mode);if(this.pendingState)this.pendingState.light=mode;if(this.state)this.state.light=mode}
 setYaw(degrees){this.root.rotation.y=THREE.MathUtils.degToRad(degrees);if(this.pendingState)this.pendingState.yaw=degrees;if(this.state)this.state.yaw=degrees}
 currentYaw(){return THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(this.root.rotation.y)+180,360)-180}
 closeup(){if(!this.state)return;this.autoCamera=false;this.autoRotate=false;const s=this.state;this.targetOpen=0;this.currentOpen=0;this.state.opening=0;this.pose();const t=lidTransform(s,0);const y=(t.position[1]+(s.construction==='magnetic'?s.board:s.lidHeight))*mm;this.controls.target.set(0,y,0);const factor=Math.max(1,1.2/this.camera.aspect);this.camera.position.set(.085*factor,y+.055*factor,.105*factor);this.controls.update()}
 frameHeight(){const s=this.state;return (s.height*.7+this.currentOpen*(s.construction==='magnetic'?s.width*.4:s.height*.5+15)+s.explode*.6)*mm}
 frameZoom(){return 1+this.currentOpen*.45+this.state.explode*.0035}
 resetCamera(view='perspective'){this.autoCamera=true;this.autoZoomFactor=this.frameZoom();const s=this.state,scale=Math.max(s.length,s.width,s.height*2)*mm*Math.max(1,1.45/this.camera.aspect)*this.autoZoomFactor;const target=new THREE.Vector3(0,this.frameHeight(),0);this.controls.target.copy(target);this.camera.position.copy(target).add(new THREE.Vector3(...(view==='top'?[.001,1.9,.001]:view==='front'?[0,.4,2]:[1.35,1.05,1.6])).multiplyScalar(scale));this.controls.update()}
 draw(){this.renderer.render(this.scene,this.camera)}
 frame(){this.animation=requestAnimationFrame(this.frame);if(this.state){const delta=this.targetOpen-this.currentOpen;if(Math.abs(delta)>.0005){this.currentOpen+=delta*.1;this.pose()}if(this.autoRotate)this.root.rotation.y+=.002;this.measurements.rotation.y=this.root.rotation.y;this.contact.rotation.y=this.root.rotation.y;this.selectionBox?.update()}this.controls.update();this.draw()}
 snapshot(){this.draw();return this.renderer.domElement.toDataURL('image/png')}
 cameraSpec() {
  return {position:this.camera.position.toArray(),target:this.controls.target.toArray(),fov:this.camera.fov};
 }
 async exportGLB(){
  this.root.updateMatrixWorld(true);
  const clone=this.root.clone(true);
  const design={...this.state,yaw:this.currentYaw(),opening:this.currentOpen*100};
  clone.userData={
   units:'metres',
   design:'VIA packaging concept',
   configuration:{...design,artwork:undefined},
   renderSpec:resolveRenderSpec(design,this.cameraSpec()),
  };
  return new GLTFExporter().parseAsync(clone,{binary:true,maxTextureSize:1536});
 }
}
