import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let stream, session, rafId, cameraRafId, renderer, scene, camera, controls, detectionEnabled = true;
let running = false, lastInference = 0, frames = 0, fpsSince = performance.now();
let mirrorVideo = false, useCanvasCamera = false, lastCameraFrame = 0;
let selectedObject, modelInput;
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const inputSize = 640;
const labels = ['person','bicycle','car','motorcycle','airplane','bus','train','truck','boat','traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat','dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack','umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket','bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple','sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair','couch','potted plant','bed','dining table','toilet','tv','laptop','mouse','remote','keyboard','cell phone','microwave','oven','toaster','sink','refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush'];

export async function start(options) {
  if (running) return;
  const video = document.querySelector('#camera-feed'), status = document.querySelector('#status-text');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.muted=true;video.autoplay=true;video.playsInline=true;video.setAttribute('playsinline','');video.srcObject=stream;await video.play();
    const facingMode=stream.getVideoTracks()[0]?.getSettings?.().facingMode;mirrorVideo=facingMode==='user';video.classList.toggle('mirrored',mirrorVideo);
    useCanvasCamera=/iPhone|iPad|iPod/i.test(navigator.userAgent);video.classList.toggle('canvas-fallback',useCanvasCamera);document.querySelector('#camera-layer').classList.toggle('active',useCanvasCamera);if(useCanvasCamera)renderCameraFrame();initThree();
    status.textContent = 'Caméra active · chargement du modèle YOLO11n…';
    if (!globalThis.ort) throw new Error('ONNX Runtime Web indisponible');
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
    session = await ort.InferenceSession.create(options.modelUrl, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    status.textContent = 'YOLO11n actif · traitement local dans votre navigateur.';
  } catch (error) {
    console.warn(error); status.textContent = error.name === 'NotAllowedError' ? 'Accès caméra refusé. Autorisez la caméra puis réessayez.' : `Mode 3D actif · IA indisponible (${error.message}). Ajoutez models/yolo11n.onnx.`;
    if (!renderer) initThree();
  }
  running = true; loop(options.confidence ?? 0.45);
}

function renderCameraFrame(now=performance.now()){
  if(!running&&stream==null)return;const video=document.querySelector('#camera-feed'),canvas=document.querySelector('#camera-layer');
  if(video.readyState>=2&&now-lastCameraFrame>=33){lastCameraFrame=now;const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const ctx=canvas.getContext('2d'),scale=Math.max(w/video.videoWidth,h/video.videoHeight),rw=video.videoWidth*scale,rh=video.videoHeight*scale,dx=(w-rw)/2,dy=(h-rh)/2;ctx.save();ctx.clearRect(0,0,w,h);if(mirrorVideo){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(video,dx,dy,rw,rh);ctx.restore();}
  cameraRafId=requestAnimationFrame(renderCameraFrame);
}

function initThree() {
  const host = document.querySelector('#three-layer');host.classList.add('empty');scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .01, 50); camera.position.set(0,.1,3);
  renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, premultipliedAlpha:false });renderer.setClearColor(0x000000,0);renderer.setClearAlpha(0);renderer.domElement.style.background='transparent'; renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); renderer.xr.enabled=true; host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xe8fbff,0x23313b,3)); const key=new THREE.DirectionalLight(0x48e5c2,5); key.position.set(2,3,4); scene.add(key);
  controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.enablePan=false; controls.minDistance=1.3; controls.maxDistance=6;
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
  renderer.domElement.addEventListener('pointerdown', placeSelectedObject);
  createModelInput();
  if(navigator.xr) document.body.appendChild(ARButton.createButton(renderer,{optionalFeatures:['dom-overlay'],domOverlay:{root:document.body}})); addEventListener('resize',resize);
}

function createModelInput(){
  modelInput=document.createElement('input');modelInput.type='file';modelInput.accept='.glb,.gltf,model/gltf-binary,model/gltf+json';modelInput.hidden=true;
  modelInput.addEventListener('change',loadSelectedModel);document.body.appendChild(modelInput);
}

async function loadSelectedModel(event){
  const file=event.target.files?.[0];if(!file)return;const status=document.querySelector('#status-text'),url=URL.createObjectURL(file);status.textContent=`Chargement de ${file.name}…`;
  try{
    const gltf=await new GLTFLoader().loadAsync(url),model=gltf.scene;removeSelectedObject();
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),maxSize=Math.max(size.x,size.y,size.z)||1;
    model.position.sub(center);selectedObject=new THREE.Group();selectedObject.add(model);selectedObject.scale.setScalar(0.8/maxSize);selectedObject.visible=false;scene.add(selectedObject);document.querySelector('#three-layer')?.classList.remove('empty');
    status.textContent=`${file.name} chargé · touchez l’écran pour le placer.`;
  }catch(error){console.error('Chargement GLB/GLTF:',error);status.textContent=`Impossible de charger ${file.name}. Utilisez de préférence un fichier GLB autonome.`;}
  finally{URL.revokeObjectURL(url);event.target.value='';}
}

function placeSelectedObject(event){
  if(!selectedObject)return;const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);const position=raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(2));selectedObject.position.copy(position);selectedObject.visible=true;
  document.querySelector('#status-text').textContent='Objet placé · glissez pour tourner la vue, utilisez la molette pour zoomer.';
}

export function openModelPicker(){modelInput?.click();}

export function addSampleChair(){
  if(!scene)return;removeSelectedObject();
  const chair=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:0x9a5b32,roughness:.62,metalness:.03}),darkWood=new THREE.MeshStandardMaterial({color:0x60351f,roughness:.72});
  const part=(size,position,material=wood)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);mesh.castShadow=true;mesh.receiveShadow=true;chair.add(mesh);};
  part([1.1,.16,1.05],[0,.15,0]);
  part([.14,1.15,.14],[-.42,-.5,-.37],darkWood);part([.14,1.15,.14],[.42,-.5,-.37],darkWood);part([.14,1.15,.14],[-.42,-.5,.37],darkWood);part([.14,1.15,.14],[.42,-.5,.37],darkWood);
  part([.14,1.2,.14],[-.43,.82,.42],darkWood);part([.14,1.2,.14],[.43,.82,.42],darkWood);part([.78,.18,.12],[0,.58,.42]);part([.78,.18,.12],[0,.92,.42]);part([.78,.18,.12],[0,1.26,.42]);
  selectedObject=chair;selectedObject.scale.setScalar(.65);selectedObject.visible=false;scene.add(selectedObject);document.querySelector('#three-layer')?.classList.remove('empty');document.querySelector('#status-text').textContent='Chaise chargée · touchez l’écran pour la placer.';
}

function removeSelectedObject(){
  if(!selectedObject)return;scene?.remove(selectedObject);selectedObject.traverse?.(node=>{node.geometry?.dispose?.();if(Array.isArray(node.material))node.material.forEach(m=>m.dispose?.());else node.material?.dispose?.();});selectedObject=null;
}

async function loop(confidence) {
  if(!running)return; const now=performance.now(); frames++; if(now-fpsSince>1000){document.querySelector('#fps-badge').textContent=`${frames} FPS`;frames=0;fpsSince=now;}
  if(session&&detectionEnabled&&now-lastInference>180){lastInference=now;try{await detect(confidence);}catch(error){console.error('Inference YOLO:',error);}}
  rafId=requestAnimationFrame(()=>loop(confidence));
}

async function detect(confidence) {
  const video=document.querySelector('#camera-feed');if(video.readyState<2)return;const prep=document.createElement('canvas');prep.width=prep.height=inputSize;const ctx=prep.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,inputSize,inputSize);const pixels=ctx.getImageData(0,0,inputSize,inputSize).data,data=new Float32Array(3*inputSize*inputSize);
  for(let i=0;i<inputSize*inputSize;i++){data[i]=pixels[i*4]/255;data[i+inputSize*inputSize]=pixels[i*4+1]/255;data[i+2*inputSize*inputSize]=pixels[i*4+2]/255;}
  const input=session.inputNames[0],results=await session.run({[input]:new ort.Tensor('float32',data,[1,3,inputSize,inputSize])});drawDetections(parseOutput(results[session.outputNames[0]],confidence),video);
}

function parseOutput(tensor,threshold){const d=tensor.data,dims=tensor.dims,channels=dims[1]<=100?dims[1]:dims[2],count=dims[1]<=100?dims[2]:dims[1],transposed=dims[1]<=100,at=(c,i)=>transposed?d[c*count+i]:d[i*channels+c],boxes=[];for(let i=0;i<count;i++){let score=0,cls=0;for(let c=4;c<channels;c++)if(at(c,i)>score){score=at(c,i);cls=c-4;}if(score>=threshold)boxes.push({x:at(0,i),y:at(1,i),w:at(2,i),h:at(3,i),score,cls});}boxes.sort((a,b)=>b.score-a.score);const kept=[];for(const b of boxes.slice(0,100))if(!kept.some(k=>iou(b,k)>.45))kept.push(b);return kept.slice(0,20);}
function iou(a,b){const ax1=a.x-a.w/2,ay1=a.y-a.h/2,ax2=a.x+a.w/2,ay2=a.y+a.h/2,bx1=b.x-b.w/2,by1=b.y-b.h/2,bx2=b.x+b.w/2,by2=b.y+b.h/2,area=Math.max(0,Math.min(ax2,bx2)-Math.max(ax1,bx1))*Math.max(0,Math.min(ay2,by2)-Math.max(ay1,by1));return area/(a.w*a.h+b.w*b.h-area);}
function drawDetections(boxes,video){
  const canvas=document.querySelector('#detection-layer'),ctx=canvas.getContext('2d'),dpr=Math.min(devicePixelRatio||1,2),displayW=Math.round(canvas.clientWidth*dpr),displayH=Math.round(canvas.clientHeight*dpr);
  if(canvas.width!==displayW||canvas.height!==displayH){canvas.width=displayW;canvas.height=displayH;}ctx.clearRect(0,0,displayW,displayH);
  const coverScale=Math.max(displayW/video.videoWidth,displayH/video.videoHeight),renderedW=video.videoWidth*coverScale,renderedH=video.videoHeight*coverScale,offsetX=(displayW-renderedW)/2,offsetY=(displayH-renderedH)/2;
  ctx.font=`bold ${Math.round(14*dpr)}px system-ui`;ctx.lineWidth=Math.max(2,2*dpr);
  for(const b of boxes){
    const sourceX=(b.x-b.w/2)/inputSize*video.videoWidth,sourceY=(b.y-b.h/2)/inputSize*video.videoHeight,w=b.w/inputSize*video.videoWidth*coverScale,h=b.h/inputSize*video.videoHeight*coverScale;
    const unmirroredX=sourceX*coverScale+offsetX,x=mirrorVideo?displayW-(unmirroredX+w):unmirroredX,y=sourceY*coverScale+offsetY;
    ctx.strokeStyle='#48e5c2';ctx.strokeRect(x,y,w,h);
    const text=`${labels[b.cls]??b.cls} ${Math.round(b.score*100)}%`,padding=6*dpr,labelH=23*dpr,tw=ctx.measureText(text).width+padding*2,labelX=Math.max(0,Math.min(x,displayW-tw)),labelY=Math.max(0,y-labelH);
    ctx.fillStyle='#48e5c2';ctx.fillRect(labelX,labelY,tw,labelH);ctx.fillStyle='#03110e';ctx.fillText(text,labelX+padding,labelY+17*dpr);
  }
}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
export function setDetectionEnabled(value){detectionEnabled=value;if(!value){const c=document.querySelector('#detection-layer');c?.getContext('2d')?.clearRect(0,0,c.width,c.height);}}
export function stop(){running=false;cancelAnimationFrame(rafId);cancelAnimationFrame(cameraRafId);renderer?.domElement.removeEventListener('pointerdown',placeSelectedObject);renderer?.setAnimationLoop(null);renderer?.dispose();controls?.dispose();stream?.getTracks().forEach(t=>t.stop());stream=null;removeEventListener('resize',resize);modelInput?.remove();document.querySelector('#ARButton')?.remove();}
