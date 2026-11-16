/**
 * NEON ARENA / ISLA TITÁN — procedural explorable third-person level.
 * Ground plane remains y=0 for reliable arcade movement; raised roofs are decorative.
 * Collision is registered for solid buildings, crates and cover.
 */
export function buildIsland3D({THREE,world,materials,obstacles,box,addSolid,sign,circle}){
 const m=(color,roughness=.82,metalness=0,glow=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness,emissive:glow||0x000000,emissiveIntensity:glow?.7:0});
 const sea=m(0x1675a0,.22,.21,0x084366),sand=m(0xd9c187),grass=m(0x64a77f),grass2=m(0x3c8b68),road=m(0x435266),stripe=m(0xffe2a2),rock=m(0x657b89);
 const ocean=new THREE.Mesh(new THREE.PlaneGeometry(550,550),sea);ocean.rotation.x=-Math.PI/2;ocean.position.y=-3.4;world.add(ocean);
 const base=new THREE.Mesh(new THREE.CylinderGeometry(102,114,4.9,96),sand);base.position.y=-2.6;base.receiveShadow=true;world.add(base);
 const land=new THREE.Mesh(new THREE.CylinderGeometry(96,101,.55,96),grass);land.position.y=-.315;land.receiveShadow=true;world.add(land);
 const center=new THREE.Mesh(new THREE.CircleGeometry(92,128),grass2);center.rotation.x=-Math.PI/2;center.position.y=-.025;center.receiveShadow=true;world.add(center);
 // Roads between six landmarks, each segment is a non-colliding mesh strip.
 function roadStrip(x1,z1,x2,z2,width=6){
  const midx=(x1+x2)/2,midz=(z1+z2)/2,dist=Math.hypot(x2-x1,z2-z1),ang=Math.atan2(x2-x1,z2-z1);
  const r=box(width,.055,dist,road,midx,.035,midz,false);r.rotation.y=ang;
  for(let k=-1;k<=1;k++)if(k!==0){const side=box(.16,.08,dist,stripe,midx+Math.cos(ang)*width*.40*k,.085,midz-Math.sin(ang)*width*.40*k,false);side.rotation.y=ang}
 }
 const main=[[0,0],[0,-55],[57,-23],[49,42],[0,57],[-54,22],[-58,-41]];
 for(let i=1;i<main.length;i++)roadStrip(0,0,main[i][0],main[i][1],6.7);
 // Central plaza and reactor.
 const pad=new THREE.Mesh(new THREE.CylinderGeometry(17,17,.25,64),road);pad.position.y=.055;world.add(pad);
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2;box(.35,.16,2.7,materials.neon,Math.sin(a)*16.8,.16,Math.cos(a)*16.8,false).rotation.y=a}
 addSolid(0,0,7,7,5.8,materials.slate);
 box(4.6,1.1,4.6,materials.cyan,0,6.5,0);
 const core=new THREE.Mesh(new THREE.IcosahedronGeometry(2.3,1),new THREE.MeshStandardMaterial({color:0xc2f1ff,emissive:0x4aecf5,emissiveIntensity:1.3,metalness:.3,roughness:.12}));
 core.position.set(0,10,0);world.add(core);
 for(let i=0;i<5;i++){const a=(i*2*Math.PI/5),r=10;const x=Math.sin(a)*r,z=Math.cos(a)*r;addSolid(x,z,3,3,2.2,i%2?materials.purple:materials.orange)}
 sign('NEON CORE',0,14,-4,10,1.9);
 // Port: containers, harbor decks and a lighthouse.
 const dock=box(34,.6,30,materials.slate,64,-.22,-28,false);
 const portObjects=[[47,-22],[55,-39],[67,-21],[77,-35],[54,-13]];
 for(let i=0;i<portObjects.length;i++){
   const [x,z]=portObjects[i];const isLong=i%2===0;
   addSolid(x,z,isLong?9:4.4,isLong?3.5:7,3.4,i%2?materials.orange:materials.purple);
   box(isLong?8.1:3.6,.16,isLong?2.5:6.2,materials.white,x,3.5,z,false);
 }
 for(let i=0;i<7;i++){const z=-49+i*7;box(.35,2,.35,materials.dark,81,1,z);box(.55,.2,.55,materials.lime,81,2.05,z)}
 box(2,13,2,materials.white,82,6.5,-62);
 box(5,2.3,5,materials.cyan,82,14,-62);
 sign('ASTILLERO',65,7,-52,12,2);
 // Forest west: grouped low-poly pine trees, stones, shrubs and wooden shelters.
 const leaves=[m(0x297a65),m(0x388862),m(0x8bc478)],trunk=m(0x664b39);
 for(let i=0;i<55;i++){
  const ang=i*2.39996,r=7+Math.sqrt(i/55)*33,x=-56+Math.sin(ang)*r,z=24+Math.cos(ang)*r;
  if(Math.hypot(x,z)>91||Math.hypot(x+54,z-22)<9||Math.abs(z)<5)continue;
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.36,.5,4,6),trunk);stem.position.set(x,2,z);stem.castShadow=true;world.add(stem);
  for(let k=0;k<3;k++){
   const foliage=new THREE.Mesh(new THREE.ConeGeometry(2.7-k*.48,3.5,7),leaves[(i+k)%3]);
   foliage.position.set(x,3.7+k*1.5,z);foliage.castShadow=true;world.add(foliage);
  }
 }
 for(let i=0;i<19;i++){
  const x=-45+Math.sin(i*17)*30,z=8+Math.cos(i*27)*25;
  const mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(1.5+(i%3)*.4,0),rock);
  mesh.position.set(x,.6,z);mesh.rotation.set(i*.4,i*.2,0);world.add(mesh);
  if(i%4===0)obstacles.push({x,z,w:2.6,d:2.6,h:2});
 }
 addSolid(-58,23,7,8,4.5,materials.orange);
 box(8,1,9,materials.purple,-58,5.1,23);
 sign('BOSQUE NEON',-59,9,17,10,1.6);
 // City with stylized sci-fi offices, glass facades and high lanes.
 for(let i=0;i<9;i++){
  const row=(i/3)|0,col=i%3,x=-20+col*19,z=-62+row*12;
  const h=5+(i*7%11),w=10;
  addSolid(x,z,w,8,h,i%2?materials.stone:materials.slate);
  box(w+.6,.3,8.6,materials.dark,x,h+.12,z);
  for(let side of [-1,1])for(let j=0;j<3;j++){
   const windows=box(.18,.73,1.3,i%2?materials.cyan:materials.neon,x+side*(w/2+.13),2+j*1.65,z-2.2+(j%2)*4,false);
  }
 }
 sign('CIUDAD ALFA',-4,14,-78,14,2.4);
 // Research station east south.
 for(let [x,z,w,d,h] of [[44,41,12,10,5],[60,42,9,14,4.2],[50,61,13,10,4.5],[72,58,5,6,3]]){
  addSolid(x,z,w,d,h,materials.stone);
  box(w+.4,.28,d+.4,materials.cyan,x,h+.2,z);
  for(let j=0;j<4;j++)box(w*.14,.4,.12,materials.neon,x-w*.29+j*w*.19,2.7,z-d/2-.1,false);
 }
 sign('LAB VECTOR',51,10,32,10,1.6);
 // Southern highland with a fortress and stone barriers.
 for(let i=0;i<13;i++){
  const a=i/13*Math.PI*2,x=Math.sin(a)*19,z=62+Math.cos(a)*12;
  if(Math.hypot(x,z)>91)continue;
  addSolid(x,z,3.7,3.7,1.9,materials.stone);
 }
 addSolid(0,57,12,9,5.8,materials.purple);
 box(15,.7,11,materials.orange,0,6.2,57);
 sign('FORTALEZA',0,11,50,11,1.8);
 // Outer lights, lookout and perimeter pylons.
 for(let i=0;i<32;i++){
  const a=i/32*Math.PI*2,x=Math.cos(a)*90,z=Math.sin(a)*90;
  if(i%2===0){
   box(.75,7,.75,materials.dark,x,3.4,z);
   box(1.3,.85,1.3,materials.neon,x,7.15,z,false);
  } else {
   const p=new THREE.Mesh(new THREE.OctahedronGeometry(1.7),materials.cyan);p.position.set(x,3,z);world.add(p);
  }
 }
 for(let i=0;i<4;i++){
  const surf=new THREE.Mesh(new THREE.TorusGeometry(98+i*2.4,.18,5,110),new THREE.MeshBasicMaterial({color:0xb9f8ec,transparent:true,opacity:.24-i*.04}));
  surf.rotation.x=Math.PI/2;surf.position.y=-2.8-i*.06;world.add(surf);
 }
 const pulse=new THREE.PointLight(0x6ee9ed,30,29);pulse.position.set(0,10,0);world.add(pulse);
 // Gradient sky direction is handled by game Three.js fog and sunlight.
 return {water:ocean,reactor:core,light:pulse};
}
