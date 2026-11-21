import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let stream, session, rafId, cameraRafId, renderer, scene, camera, controls, transformControls, transformHelper, detectionEnabled = true;
let running = false, lastInference = 0, frames = 0, fpsSince = performance.now();
let mirrorVideo = false, useCanvasCamera = false, lastCameraFrame = 0;
let selectedObject, modelInput, selectedObjectKind;
let orientationTracking = false, orientationHandler, orientationCalibration, sensorPermissionGranted = false;
const discoveredCategories = new Map(), excludedCategories = new Set();
let navigationMap, userMarker, destinationMarker, routeLine, locationWatchId, currentLocation, destination, routeSteps = [], navigationStepIndex = 0, deviceHeading = 0;
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const inputSize = 640;
const chairTransformStorageKey = 'webar.sample-chair.transform.v1';
const excludedCategoriesStorageKey = 'webar.excluded-categories.v1';
const labels = ['person','bicycle','car','motorcycle','airplane','bus','train','truck','boat','traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat','dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack','umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket','bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple','sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair','couch','potted plant','bed','dining table','toilet','tv','laptop','mouse','remote','keyboard','cell phone','microwave','oven','toaster','sink','refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush'];

globalThis.requestWebARSensorPermission=async()=>{
  try{sensorPermissionGranted=typeof DeviceOrientationEvent!=='undefined'&&(typeof DeviceOrientationEvent.requestPermission!=='function'||await DeviceOrientationEvent.requestPermission()==='granted');}
  catch(error){sensorPermissionGranted=false;console.warn('Autorisation des capteurs:',error);}
};

export async function start(options) {
  if (running) return;
  const video = document.querySelector('#camera-feed'), status = document.querySelector('#status-text');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.muted=true;video.autoplay=true;video.playsInline=true;video.setAttribute('playsinline','');video.srcObject=stream;await video.play();
    const facingMode=stream.getVideoTracks()[0]?.getSettings?.().facingMode;mirrorVideo=facingMode==='user';video.classList.toggle('mirrored',mirrorVideo);
    useCanvasCamera=/iPhone|iPad|iPod/i.test(navigator.userAgent);video.classList.toggle('canvas-fallback',useCanvasCamera);document.querySelector('#camera-layer').classList.toggle('active',useCanvasCamera);if(useCanvasCamera)renderCameraFrame();initThree();await enableOrientationTracking(true);
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
  transformControls=new TransformControls(camera,renderer.domElement);transformControls.setMode('translate');transformControls.setSize(.8);transformControls.addEventListener('dragging-changed',event=>{controls.enabled=!event.value;});transformControls.addEventListener('objectChange',saveSelectedObjectTransform);transformHelper=transformControls.getHelper();transformHelper.visible=false;scene.add(transformHelper);
  renderer.setAnimationLoop(()=>{if(!orientationTracking)controls.update();renderer.render(scene,camera);});
  renderer.domElement.addEventListener('pointerdown', placeSelectedObject);
  document.querySelector('#spatial-tracking-button')?.addEventListener('click',enableOrientationTracking);
  initCategoryPanel();
  document.querySelector('#navigation-close')?.addEventListener('click',stopNavigation);
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
    model.position.sub(center);selectedObject=new THREE.Group();selectedObjectKind='uploaded';selectedObject.add(model);selectedObject.scale.setScalar(0.8/maxSize);selectedObject.visible=false;scene.add(selectedObject);document.querySelector('#three-layer')?.classList.remove('empty');
    status.textContent=`${file.name} chargé · touchez l’écran pour le placer.`;
  }catch(error){console.error('Chargement GLB/GLTF:',error);status.textContent=`Impossible de charger ${file.name}. Utilisez de préférence un fichier GLB autonome.`;}
  finally{URL.revokeObjectURL(url);event.target.value='';}
}

function placeSelectedObject(event){
  if(!selectedObject||selectedObject.visible)return;const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);const position=raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(2));selectedObject.position.copy(position);selectedObject.visible=true;transformControls.attach(selectedObject);transformHelper.visible=true;saveSelectedObjectTransform();
  document.querySelector('#status-text').textContent='Objet placé · utilisez le gizmo central pour le déplacer ou le tourner.';
}

export function openModelPicker(){modelInput?.click();}

export function addSampleChair(){
  if(!scene)return;removeSelectedObject();
  const chair=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:0x9a5b32,roughness:.62,metalness:.03}),darkWood=new THREE.MeshStandardMaterial({color:0x60351f,roughness:.72});
  const part=(size,position,material=wood)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);mesh.castShadow=true;mesh.receiveShadow=true;chair.add(mesh);};
  part([1.1,.16,1.05],[0,.15,0]);
  part([.14,1.15,.14],[-.42,-.5,-.37],darkWood);part([.14,1.15,.14],[.42,-.5,-.37],darkWood);part([.14,1.15,.14],[-.42,-.5,.37],darkWood);part([.14,1.15,.14],[.42,-.5,.37],darkWood);
  part([.14,1.2,.14],[-.43,.82,.42],darkWood);part([.14,1.2,.14],[.43,.82,.42],darkWood);part([.78,.18,.12],[0,.58,.42]);part([.78,.18,.12],[0,.92,.42]);part([.78,.18,.12],[0,1.26,.42]);
  selectedObject=chair;selectedObjectKind='sample-chair';selectedObject.scale.setScalar(.65);selectedObject.visible=false;scene.add(selectedObject);document.querySelector('#three-layer')?.classList.remove('empty');
  if(restoreChairTransform()){transformControls.attach(selectedObject);transformHelper.visible=true;document.querySelector('#status-text').textContent='Chaise restaurée à sa dernière position.';}
  else document.querySelector('#status-text').textContent='Chaise chargée · touchez l’écran pour la placer.';
}

export function removeSampleChair(){
  if(selectedObjectKind!=='sample-chair')return;removeSelectedObject();document.querySelector('#three-layer')?.classList.add('empty');document.querySelector('#status-text').textContent='IA active · chaise retirée de la scène.';
}

function saveSelectedObjectTransform(){
  if(selectedObjectKind!=='sample-chair'||!selectedObject?.visible)return;
  try{localStorage.setItem(chairTransformStorageKey,JSON.stringify({position:selectedObject.position.toArray(),quaternion:selectedObject.quaternion.toArray(),scale:selectedObject.scale.toArray()}));}catch(error){console.warn('Sauvegarde de la position de la chaise impossible:',error);}
}

function restoreChairTransform(){
  try{
    const saved=JSON.parse(localStorage.getItem(chairTransformStorageKey));
    if(!saved||!Array.isArray(saved.position)||!Array.isArray(saved.quaternion)||!Array.isArray(saved.scale))return false;
    selectedObject.position.fromArray(saved.position);selectedObject.quaternion.fromArray(saved.quaternion);selectedObject.scale.fromArray(saved.scale);selectedObject.visible=true;return true;
  }catch(error){console.warn('Restauration de la position de la chaise impossible:',error);return false;}
}

function removeSelectedObject(){
  if(!selectedObject)return;transformControls?.detach();if(transformHelper)transformHelper.visible=false;scene?.remove(selectedObject);selectedObject.traverse?.(node=>{node.geometry?.dispose?.();if(Array.isArray(node.material))node.material.forEach(m=>m.dispose?.());else node.material?.dispose?.();});selectedObject=null;selectedObjectKind=null;
}

export function setTransformMode(mode){if(mode!=='translate'&&mode!=='rotate')return;transformControls?.setMode(mode);if(transformHelper&&selectedObject?.visible)transformHelper.visible=true;}

async function enableOrientationTracking(automatic=false){
  const status=document.querySelector('#status-text'),button=document.querySelector('#spatial-tracking-button');
  try{
    if(typeof DeviceOrientationEvent==='undefined')throw new Error('capteurs d’orientation indisponibles');
    if(typeof DeviceOrientationEvent.requestPermission==='function'&&!sensorPermissionGranted){
      if(automatic)throw new Error('touchez « Suivi spatial » pour autoriser les capteurs');
      const permission=await DeviceOrientationEvent.requestPermission();if(permission!=='granted')throw new Error('autorisation des capteurs refusée');sensorPermissionGranted=true;
    }
    if(orientationHandler)removeEventListener('deviceorientation',orientationHandler,true);
    orientationCalibration=null;orientationHandler=updateCameraOrientation;addEventListener('deviceorientation',orientationHandler,true);orientationTracking=true;controls.enabled=false;
    if(button){button.textContent='Suivi spatial actif';button.classList.add('active');}
    status.textContent='Suivi spatial actif · la chaise reste orientée dans la scène lorsque vous tournez le téléphone.';
  }catch(error){console.warn('Suivi spatial:',error);status.textContent=`Suivi spatial indisponible (${error.message}).`;}
}

function updateCameraOrientation(event){
  if(event.alpha==null||event.beta==null||event.gamma==null||renderer?.xr?.isPresenting)return;
  const deg=THREE.MathUtils.DEG2RAD,euler=new THREE.Euler(THREE.MathUtils.degToRad(event.beta),THREE.MathUtils.degToRad(event.alpha),-THREE.MathUtils.degToRad(event.gamma),'YXZ');
  const raw=new THREE.Quaternion().setFromEuler(euler).multiply(new THREE.Quaternion(-Math.sqrt(.5),0,0,Math.sqrt(.5)));
  const screenAngle=(screen.orientation?.angle??window.orientation??0)*deg;raw.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-screenAngle));
  if(!orientationCalibration)orientationCalibration=camera.quaternion.clone().multiply(raw.clone().invert());
  camera.quaternion.copy(orientationCalibration).multiply(raw);
  deviceHeading=event.webkitCompassHeading??((360-event.alpha)%360);updateNavigationGuidance();
}

export function startNavigation(){
  const panel=document.querySelector('#navigation-panel'),help=document.querySelector('#navigation-help');panel?.classList.add('active');
  if(!globalThis.L){help.textContent='La carte OpenStreetMap est indisponible.';return;}
  if(!navigationMap){
    navigationMap=L.map('navigation-map',{zoomControl:true}).setView([33.5731,-7.5898],14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(navigationMap);
    navigationMap.on('click',event=>setNavigationDestination(event.latlng));
  }
  setTimeout(()=>navigationMap.invalidateSize(),50);
  if(!navigator.geolocation){help.textContent='La géolocalisation est indisponible sur cet appareil.';return;}
  help.textContent='Recherche de votre position…';
  navigator.geolocation.getCurrentPosition(onLocationUpdate,onLocationError,{enableHighAccuracy:true,timeout:12000,maximumAge:3000});
  if(locationWatchId==null)locationWatchId=navigator.geolocation.watchPosition(onLocationUpdate,onLocationError,{enableHighAccuracy:true,maximumAge:2000,timeout:15000});
}

function onLocationUpdate(position){
  currentLocation={lat:position.coords.latitude,lng:position.coords.longitude};
  if(!userMarker){userMarker=L.circleMarker(currentLocation,{radius:8,color:'#03110e',weight:3,fillColor:'#48e5c2',fillOpacity:1}).addTo(navigationMap);navigationMap.setView(currentLocation,17);}else userMarker.setLatLng(currentLocation);
  document.querySelector('#navigation-help').textContent=destination?'Navigation active.':'Touchez la carte pour choisir votre destination.';updateNavigationGuidance();
}

function onLocationError(error){const help=document.querySelector('#navigation-help');if(help)help.textContent=error.code===1?'Autorisez la localisation pour démarrer la navigation.':`Position GPS indisponible (${error.message}).`;}

async function setNavigationDestination(latlng){
  destination={lat:latlng.lat,lng:latlng.lng};if(destinationMarker)destinationMarker.setLatLng(destination);else destinationMarker=L.marker(destination).addTo(navigationMap);
  if(!currentLocation){document.querySelector('#navigation-help').textContent='En attente de votre position GPS…';return;}
  const help=document.querySelector('#navigation-help');help.textContent='Calcul de l’itinéraire piéton…';
  try{
    const coordinates=`${currentLocation.lng},${currentLocation.lat};${destination.lng},${destination.lat}`,url=`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coordinates}?overview=full&steps=true&geometries=geojson`;
    const response=await fetch(url);if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json(),route=data.routes?.[0];if(!route)throw new Error('aucun itinéraire trouvé');
    const latlngs=route.geometry.coordinates.map(point=>[point[1],point[0]]);if(routeLine)routeLine.setLatLngs(latlngs);else routeLine=L.polyline(latlngs,{color:'#48e5c2',weight:6,opacity:.9}).addTo(navigationMap);
    routeSteps=route.legs.flatMap(leg=>leg.steps);navigationStepIndex=0;navigationMap.fitBounds(routeLine.getBounds(),{padding:[24,24]});help.textContent='Navigation active.';document.querySelector('#navigation-guidance').hidden=false;updateNavigationGuidance();
  }catch(error){console.error('Itinéraire OSM:',error);help.textContent=`Impossible de calculer l’itinéraire (${error.message}).`;}
}

function updateNavigationGuidance(){
  if(!currentLocation||!destination||!routeSteps.length)return;while(navigationStepIndex<routeSteps.length-1&&distanceMeters(currentLocation,toLatLng(routeSteps[navigationStepIndex].maneuver.location))<18)navigationStepIndex++;
  const step=routeSteps[navigationStepIndex],target=toLatLng(step.maneuver.location),bearing=bearingDegrees(currentLocation,target),relative=((bearing-deviceHeading+540)%360)-180;
  const arrow=document.querySelector('#navigation-arrow');if(arrow)arrow.style.transform=`rotate(${relative}deg)`;
  const instruction=document.querySelector('#navigation-instruction'),distance=document.querySelector('#navigation-distance');if(instruction)instruction.textContent=translateManeuver(step.maneuver);if(distance)distance.textContent=`${formatDistance(distanceMeters(currentLocation,target))} · destination ${formatDistance(distanceMeters(currentLocation,destination))}`;
}

function translateManeuver(maneuver){const modifier=maneuver.modifier??'';if(maneuver.type==='arrive')return'Vous êtes arrivé';if(modifier.includes('left'))return'Tournez à gauche';if(modifier.includes('right'))return'Tournez à droite';if(modifier==='uturn')return'Faites demi-tour';return'Continuez tout droit';}
function toLatLng(location){return{lat:location[1],lng:location[0]};}
function distanceMeters(a,b){const r=6371000,p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180,s=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*r*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));}
function bearingDegrees(a,b){const p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180;return(Math.atan2(Math.sin(dl)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl))*180/Math.PI+360)%360;}
function formatDistance(value){return value<1000?`${Math.max(1,Math.round(value))} m`:`${(value/1000).toFixed(1)} km`;}
function stopNavigation(){document.querySelector('#navigation-panel')?.classList.remove('active');document.querySelector('#navigation-guidance').hidden=true;if(locationWatchId!=null)navigator.geolocation.clearWatch(locationWatchId);locationWatchId=null;}

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
  updateDetectedCategories(boxes);
  for(const b of boxes.filter(b=>!excludedCategories.has(labels[b.cls]??String(b.cls)))){
    const sourceX=(b.x-b.w/2)/inputSize*video.videoWidth,sourceY=(b.y-b.h/2)/inputSize*video.videoHeight,w=b.w/inputSize*video.videoWidth*coverScale,h=b.h/inputSize*video.videoHeight*coverScale;
    const unmirroredX=sourceX*coverScale+offsetX,x=mirrorVideo?displayW-(unmirroredX+w):unmirroredX,y=sourceY*coverScale+offsetY;
    ctx.strokeStyle='#48e5c2';ctx.strokeRect(x,y,w,h);
    const text=`${labels[b.cls]??b.cls} ${Math.round(b.score*100)}%`,padding=6*dpr,labelH=23*dpr,tw=ctx.measureText(text).width+padding*2,labelX=Math.max(0,Math.min(x,displayW-tw)),labelY=Math.max(0,y-labelH);
    ctx.fillStyle='#48e5c2';ctx.fillRect(labelX,labelY,tw,labelH);ctx.fillStyle='#03110e';ctx.fillText(text,labelX+padding,labelY+17*dpr);
  }
}

function initCategoryPanel(){
  try{for(const name of JSON.parse(localStorage.getItem(excludedCategoriesStorageKey))??[])excludedCategories.add(name);}catch(error){console.warn('Lecture des catégories exclues:',error);}
  document.querySelector('#category-list')?.addEventListener('change',onCategoryFilterChange);
  document.querySelector('#keep-all-categories')?.addEventListener('click',keepAllCategories);
  document.querySelector('#exclude-all-categories')?.addEventListener('click',excludeAllCategories);
  document.querySelector('#category-panel-toggle')?.addEventListener('click',toggleCategoryPanel);
}

function updateDetectedCategories(boxes){
  const current=new Map();for(const box of boxes){const name=labels[box.cls]??String(box.cls),item=current.get(name)??{count:0,score:0};item.count++;item.score=Math.max(item.score,box.score);current.set(name,item);}
  let changed=false;for(const [name,item] of current){const previous=discoveredCategories.get(name);if(!previous||previous.count!==item.count||Math.abs(previous.score-item.score)>.01){discoveredCategories.set(name,item);changed=true;}}
  if(changed)renderCategoryPanel();
}

function renderCategoryPanel(){
  const list=document.querySelector('#category-list');if(!list)return;list.replaceChildren();
  if(!discoveredCategories.size){const empty=document.createElement('p');empty.className='category-empty';empty.textContent='Aucun objet détecté';list.appendChild(empty);return;}
  for(const [name,item] of [...discoveredCategories].sort((a,b)=>Number(excludedCategories.has(a[0]))-Number(excludedCategories.has(b[0]))||b[1].score-a[1].score)){
    const row=document.createElement('label');row.className='category-row';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=!excludedCategories.has(name);checkbox.dataset.category=name;
    const title=document.createElement('span');title.className='category-name';title.textContent=`${name} ×${item.count}`;const score=document.createElement('span');score.className='category-score';score.textContent=`${Math.round(item.score*100)} %`;
    row.append(checkbox,title,score);list.appendChild(row);
  }
}

function onCategoryFilterChange(event){const name=event.target?.dataset?.category;if(!name)return;if(event.target.checked)excludedCategories.delete(name);else excludedCategories.add(name);saveCategoryFilters();renderCategoryPanel();}
function keepAllCategories(){excludedCategories.clear();saveCategoryFilters();renderCategoryPanel();}
function excludeAllCategories(){for(const name of discoveredCategories.keys())excludedCategories.add(name);saveCategoryFilters();renderCategoryPanel();}
function saveCategoryFilters(){try{localStorage.setItem(excludedCategoriesStorageKey,JSON.stringify([...excludedCategories]));}catch(error){console.warn('Sauvegarde des catégories exclues:',error);}}
function toggleCategoryPanel(){const panel=document.querySelector('#category-panel'),mobile=matchMedia('(max-width: 560px)').matches;if(mobile){const expanded=panel?.classList.toggle('expanded-mobile');panel?.classList.toggle('collapsed',!expanded);}else panel?.classList.toggle('collapsed');const expanded=mobile?panel?.classList.contains('expanded-mobile'):!panel?.classList.contains('collapsed');document.querySelector('#category-panel-toggle')?.setAttribute('aria-expanded',String(expanded));}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
export function setDetectionEnabled(value){detectionEnabled=value;if(!value){const c=document.querySelector('#detection-layer');c?.getContext('2d')?.clearRect(0,0,c.width,c.height);}}
export function stop(){running=false;cancelAnimationFrame(rafId);cancelAnimationFrame(cameraRafId);stopNavigation();renderer?.domElement.removeEventListener('pointerdown',placeSelectedObject);document.querySelector('#spatial-tracking-button')?.removeEventListener('click',enableOrientationTracking);document.querySelector('#navigation-close')?.removeEventListener('click',stopNavigation);document.querySelector('#category-list')?.removeEventListener('change',onCategoryFilterChange);document.querySelector('#keep-all-categories')?.removeEventListener('click',keepAllCategories);document.querySelector('#exclude-all-categories')?.removeEventListener('click',excludeAllCategories);document.querySelector('#category-panel-toggle')?.removeEventListener('click',toggleCategoryPanel);if(orientationHandler)removeEventListener('deviceorientation',orientationHandler,true);orientationHandler=null;orientationTracking=false;transformControls?.detach();transformControls?.dispose();renderer?.setAnimationLoop(null);renderer?.dispose();controls?.dispose();stream?.getTracks().forEach(t=>t.stop());stream=null;removeEventListener('resize',resize);modelInput?.remove();document.querySelector('#ARButton')?.remove();}
