let stream,cameraRafId,lastCameraFrame=0,useCanvasCamera=false;
const captures=[];
const targetCount=36;

export async function start(){
  const video=document.querySelector('#scan-camera'),status=document.querySelector('#scan-status');
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});video.muted=true;video.autoplay=true;video.playsInline=true;video.setAttribute('playsinline','');video.srcObject=stream;await video.play();useCanvasCamera=/iPhone|iPad|iPod/i.test(navigator.userAgent);video.classList.toggle('canvas-fallback',useCanvasCamera);document.querySelector('#scan-camera-layer')?.classList.toggle('active',useCanvasCamera);if(useCanvasCamera)renderCameraFrame();status.textContent='Objet centré : prenez une photo, puis déplacez-vous légèrement vers la droite.';}
  catch(error){status.textContent=error.name==='NotAllowedError'?'Accès caméra refusé. Autorisez la caméra puis réessayez.':'Caméra indisponible ('+error.message+').';throw error;}
}

export function capture(){
  const video=document.querySelector('#scan-camera');if(!video||video.readyState<2)return captures.length;
  if(captures.length>=targetCount)return captures.length;
  const canvas=document.createElement('canvas'),maxWidth=1600,scale=Math.min(1,maxWidth/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  const dataUrl=canvas.toDataURL('image/jpeg',.9);captures.push(dataUrl);const image=document.createElement('img');image.src=dataUrl;image.alt='Vue '+captures.length;document.querySelector('#scan-thumbnails')?.appendChild(image);
  const angle=Math.round(captures.length/targetCount*360),remaining=Math.max(0,targetCount-captures.length);document.querySelector('#scan-guidance').textContent=remaining?'Continuez autour de l’objet · '+angle+'°':'Tour complet terminé';document.querySelector('#scan-status').textContent=remaining?'Encore '+remaining+' photo'+(remaining>1?'s':'')+'. Gardez la même distance et un bon éclairage.':'Capture complète · prête pour la reconstruction 3D.';return captures.length;
}

function renderCameraFrame(now=performance.now()){
  if(!stream)return;const video=document.querySelector('#scan-camera'),canvas=document.querySelector('#scan-camera-layer');
  if(video.readyState>=2&&now-lastCameraFrame>=33){lastCameraFrame=now;const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const ctx=canvas.getContext('2d'),scale=Math.max(w/video.videoWidth,h/video.videoHeight),rw=video.videoWidth*scale,rh=video.videoHeight*scale;ctx.drawImage(video,(w-rw)/2,(h-rh)/2,rw,rh);}
  cameraRafId=requestAnimationFrame(renderCameraFrame);
}

export async function exportCaptures(){
  if(captures.length<24)throw new Error('Au moins 24 photos sont nécessaires.');if(!globalThis.JSZip)throw new Error('Module ZIP indisponible.');const zip=new JSZip();captures.forEach((dataUrl,index)=>zip.file('photo-'+String(index+1).padStart(2,'0')+'.jpg',dataUrl.split(',')[1],{base64:true}));zip.file('README.txt','Jeu de '+captures.length+' photos WebAR Vision pour reconstruction photogrammétrique.');const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='webar-scan-3d.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);document.querySelector('#scan-status').textContent='Photos exportées. Importez le ZIP dans votre moteur de photogrammétrie.';
}

export async function startReconstruction(apiBaseUrl){
  const status=document.querySelector('#scan-status');if(captures.length<24){status.textContent='Capturez au moins 24 photos.';return;}
  try{
    status.textContent='Envoi des photos vers le moteur 3D…';const form=new FormData();for(let index=0;index<captures.length;index++){const blob=await(await fetch(captures[index])).blob();form.append('photos',blob,'photo-'+String(index+1).padStart(2,'0')+'.jpg');}
    const response=await fetch(apiBaseUrl.replace(/\/$/,'')+'/api/reconstruction/jobs',{method:'POST',body:form});if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.message??('HTTP '+response.status));}const job=await response.json();status.textContent='Photos reçues · en attente du worker Meshroom.';pollReconstruction(apiBaseUrl,job.id);
  }catch(error){console.error('Reconstruction 3D:',error);status.textContent='Échec de l’envoi ('+error.message+'). Vérifiez que WebAR.API est accessible.';}
}

function pollReconstruction(apiBaseUrl,jobId){
  const base=apiBaseUrl.replace(/\/$/,'');const timer=setInterval(async()=>{try{const response=await fetch(base+'/api/reconstruction/jobs/'+jobId);if(!response.ok)return;const job=await response.json();document.querySelector('#scan-status').textContent=job.message??('Reconstruction : '+job.status);if(job.status==='completed'){clearInterval(timer);const link=document.createElement('a');link.className='scan-result-link';link.href=base+'/api/reconstruction/jobs/'+jobId+'/result';link.textContent='Télécharger le modèle GLB';link.download='scan-3d.glb';document.querySelector('.scan-panel')?.appendChild(link);}else if(job.status==='failed')clearInterval(timer);}catch(error){console.warn('Suivi reconstruction:',error);}},5000);
}

export function reset(){captures.length=0;document.querySelector('#scan-thumbnails')?.replaceChildren();document.querySelector('#scan-guidance').textContent='Placez l’objet au centre';document.querySelector('#scan-status').textContent='Prenez des photos nettes en tournant progressivement autour de l’objet.';}
export function stop(){cancelAnimationFrame(cameraRafId);stream?.getTracks().forEach(track=>track.stop());stream=null;reset();}
