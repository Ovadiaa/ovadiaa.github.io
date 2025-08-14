// main.js — מודול ES עם Three.js מ-CDN
import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js';

// Simplex / Perlin noise implementation (small)
class FastRandom {
  constructor(seed=12345){ this.x=seed>>>0; }
  next(){ this.x = (1664525 * this.x + 1013904223) >>> 0; return this.x/4294967296; }
}
function fade(t){ return t*t*t*(t*(t*6-15)+10); }
function lerp(a,b,t){ return a+(b-a)*t; }
function grad(hash, x, y){ const h=hash&3; const u=h<2?x:y; const v=h<2?y:x; return ((h&1)?-u:u) + ((h&2)?-2*v:2*v); }
class Perlin {
  constructor(seed=0){ this.p = new Uint8Array(512); let rnd=new FastRandom(seed); for(let i=0;i<256;i++) this.p[i]=i; for(let i=255;i>0;i--){ const j=Math.floor(rnd.next()*(i+1)); const t=this.p[i]; this.p[i]=this.p[j]; this.p[j]=t; } for(let i=0;i<256;i++) this.p[i+256]=this.p[i]; }
  noise2(x,y){
    const X=Math.floor(x)&255, Y=Math.floor(y)&255;
    const xf=x-Math.floor(x), yf=y-Math.floor(y);
    const u=fade(xf), v=fade(yf);
    const p=this.p;
    const aa=p[p[X]+Y], ab=p[p[X]+Y+1], ba=p[p[X+1]+Y], bb=p[p[X+1]+Y+1];
    const res = lerp( lerp(grad(aa,xf,yf), grad(ba,xf-1,yf), u), lerp(grad(ab,xf,yf-1), grad(bb,xf-1,yf-1), u), v);
    return (res+1)/2;
  }
}

// Globals
const canvas = document.getElementById('c');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky-ish
const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;

// lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 0.9); scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(5,10,7); dir.castShadow=true; scene.add(dir);

// car (simple box)
const car = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(1.4,0.4,0.8), new THREE.MeshStandardMaterial({color:0xff3344}));
body.position.y=0.45; body.castShadow=true; car.add(body);
const wheelGeo = new THREE.CylinderGeometry(0.18,0.18,0.12,12);
wheelGeo.rotateZ(Math.PI/2);
const wheelMat = new THREE.MeshStandardMaterial({color:0x111111});
for(let i=0;i<4;i++){ const w=new THREE.Mesh(wheelGeo,wheelMat); w.castShadow=true; const sx = (i%2? -0.5:0.5); const sz = (i<2? -0.3:0.3); w.position.set(sx,0.18,sz); car.add(w); }
car.position.set(0,0,0);
scene.add(car);

// camera follow
camera.position.set(0,3.2,6);
camera.lookAt(0,0,0);

// controls for debug (hidden on mobile)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;

// terrain system: chunked grid around player
const CHUNK = 40; // meters
const RES = 32;   // vertices per side
const RADIUS = 2; // number of chunks from center in each direction (so visible grid = (2R+1)^2)
const chunks = new Map();
const seed = Math.floor(Math.random()*1000000);
const perlin = new Perlin(seed);
document.getElementById('seed').textContent = 'seed: '+seed;

// generate chunk key
function key(ix,iz){ return ix+','+iz; }

function createChunk(ix,iz){
  const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, RES, RES);
  geo.rotateX(-Math.PI/2);
  // fill heights by layered noise
  const offX = ix*CHUNK, offZ = iz*CHUNK;
  const pos = geo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const vx = pos.getX(i) + offX;
    const vz = pos.getZ(i) + offZ;
    // multi-octave noise for varied terrain
    const h = (
      perlin.noise2(vx*0.005, vz*0.005) * 6 +
      perlin.noise2(vx*0.02,  vz*0.02)  * 2 +
      perlin.noise2(vx*0.08,  vz*0.08)  * 0.7
    );
    pos.setY(i, h - 1.6); // lower baseline
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({color:0x3a7f3a, flatShading:false});
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow=true; mesh.position.set(offX + CHUNK/2, 0, offZ + CHUNK/2);
  // add some simple objects (rocks/trees) based on noise
  const objs = new THREE.Group();
  const rnd = new FastRandom(ix*3749 + iz*127 + seed);
  for(let i=0;i<6;i++){
    if (rnd.next() > 0.6) continue;
    const bx = (rnd.next()-0.5)*CHUNK;
    const bz = (rnd.next()-0.5)*CHUNK;
    const worldX = offX + bx + CHUNK/2;
    const worldZ = offZ + bz + CHUNK/2;
    const hh = perlin.noise2(worldX*0.005, worldZ*0.005)*6 - 1.6;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(0.4+rnd.next()*0.6, 0.8+rnd.next()*0.8, 6), new THREE.MeshStandardMaterial({color:0x6b5042}));
    rock.position.set(mesh.position.x + bx, hh + 0.2, mesh.position.z + bz);
    rock.castShadow=true;
    objs.add(rock);
  }
  mesh.userData.objects = objs;
  const group = new THREE.Group();
  group.add(mesh);
  group.add(objs);
  return group;
}

function updateChunks(playerX, playerZ){
  const cx = Math.floor(playerX / CHUNK);
  const cz = Math.floor(playerZ / CHUNK);
  const needed = new Set();
  for(let dx=-RADIUS; dx<=RADIUS; dx++) for(let dz=-RADIUS; dz<=RADIUS; dz++){
    const k = key(cx+dx, cz+dz);
    needed.add(k);
    if (!chunks.has(k)){
      const ch = createChunk(cx+dx, cz+dz);
      chunks.set(k, ch);
      scene.add(ch);
    }
  }
  // remove far chunks
  for(const k of chunks.keys()){
    if (!needed.has(k)){
      const ch = chunks.get(k);
      scene.remove(ch);
      ch.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      chunks.delete(k);
    }
  }
}

// simple UI
const speedEl = document.getElementById('speed');
const coordsEl = document.getElementById('coords');

// input
const input = { fwd:false, back:false, left:false, right:false };
window.addEventListener('keydown', e=>{
  if (e.key==='w' || e.key==='ArrowUp') input.fwd=true;
  if (e.key==='s' || e.key==='ArrowDown') input.back=true;
  if (e.key==='a' || e.key==='ArrowLeft') input.left=true;
  if (e.key==='d' || e.key==='ArrowRight') input.right=true;
});
window.addEventListener('keyup', e=>{
  if (e.key==='w' || e.key==='ArrowUp') input.fwd=false;
  if (e.key==='s' || e.key==='ArrowDown') input.back=false;
  if (e.key==='a' || e.key==='ArrowLeft') input.left=false;
  if (e.key==='d' || e.key==='ArrowRight') input.right=false;
});

// mobile touch buttons (simple)
const createTouchButtons = ()=>{
  const left = document.createElement('button'); left.textContent='⟲'; left.style.cssText='position:fixed;left:12px;bottom:12px;z-index:60;padding:12px;border-radius:50%'; document.body.appendChild(left);
  const right = document.createElement('button'); right.textContent='⟳'; right.style.cssText='position:fixed;left:84px;bottom:12px;z-index:60;padding:12px;border-radius:50%'; document.body.appendChild(right);
  const gas = document.createElement('button'); gas.textContent='▲'; gas.style.cssText='position:fixed;right:12px;bottom:12px;z-index:60;padding:12px;border-radius:50%'; document.body.appendChild(gas);
  left.addEventListener('touchstart', e=>{ e.preventDefault(); input.left=true;}); left.addEventListener('touchend', e=>{ e.preventDefault(); input.left=false;});
  right.addEventListener('touchstart', e=>{ e.preventDefault(); input.right=true;}); right.addEventListener('touchend', e=>{ e.preventDefault(); input.right=false;});
  gas.addEventListener('touchstart', e=>{ e.preventDefault(); input.fwd=true;}); gas.addEventListener('touchend', e=>{ e.preventDefault(); input.fwd=false;});
};
createTouchButtons();

// simple physics model for 'car'
const carState = { x:0, z:0, rot:0, vel:0 };
function simulate(dt){
  // controls -> acceleration/steer
  const accel = (input.fwd? 6 : 0) - (input.back? 3 : 0) - carState.vel*0.5;
  carState.vel += accel * dt;
  carState.vel = Math.max(-6, Math.min(28, carState.vel));
  const steer = (input.left? 1 : 0) - (input.right? 1 : 0);
  carState.rot += steer * 1.2 * dt * (0.8 + Math.abs(carState.vel)/10);
  // move
  const forward = new THREE.Vector3(Math.sin(carState.rot),0,Math.cos(carState.rot));
  carState.x += forward.x * carState.vel * dt;
  carState.z += forward.z * carState.vel * dt;
  // apply small gravity to ground height
  // sample terrain height by inspecting nearest chunk's geometry (approx)
  let groundY = -1.6;
  // coarse sampling via noise
  groundY = perlin.noise2(carState.x*0.005, carState.z*0.005) * 6 + perlin.noise2(carState.x*0.02, carState.z*0.02)*2 - 1.6;
  // adjust car Y smoothly if needed
  car.position.y += (groundY + 0.45 - car.position.y) * 0.1;
  car.rotation.y = carState.rot;
  car.position.x = carState.x;
  car.position.z = carState.z;
}

// resize
function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w,h,true);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// loop
let last = performance.now();
function tick(now){
  const dt = Math.min(0.05, (now-last)/1000);
  last = now;
  simulate(dt);
  // update chunks around car
  updateChunks(carState.x, carState.z);
  // camera follow: placed behind car
  const camOffset = new THREE.Vector3(0,2.6,6).applyAxisAngle(new THREE.Vector3(0,1,0), carState.rot);
  camera.position.lerp(new THREE.Vector3(car.position.x + camOffset.x, car.position.y + camOffset.y, car.position.z + camOffset.z), 0.12);
  camera.lookAt(car.position.x, car.position.y + 0.6, car.position.z);
  renderer.render(scene, camera);
  // HUD
  document.getElementById('speed').textContent = 'מהירות: ' + Math.round(carState.vel*10);
  document.getElementById('coords').textContent = 'x:' + Math.round(carState.x) + ' z:' + Math.round(carState.z);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// reset button
document.getElementById('btnReset').addEventListener('click', ()=>{
  carState.x = carState.z = carState.rot = carState.vel = 0;
  car.position.set(0,0,0);
  // remove chunks
  for(const k of Array.from(chunks.keys())){ const ch = chunks.get(k); scene.remove(ch); ch.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); }); chunks.delete(k); }
});

// init some distant fog for atmosphere
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0025);
