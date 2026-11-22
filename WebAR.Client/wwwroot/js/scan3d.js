let stream;
const captures=[];
const targetCount=36;

export async function start(){
  const video=document.querySelector('#scan-camera'),status=document.querySelector('#scan-status');
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});video.srcObject=stream;video.playsInline=true;await video.play();status.textContent='Objet centré : prenez une photo, puis déplacez-vous légèrement vers la droite.';}
  catch(error){status.textContent=error.name==='NotAllowedError'?'Accès caméra refusé. Autorisez la caméra puis réessayez.':'Caméra indisponible ('+error.message+').';throw error;}
}

export function capture(){
  const video=document.querySelector('#scan-camera');if(!video||video.readyState<2)return captures.length;
  const canvas=document.createElement('canvas'),maxWidth=1600,scale=Math.min(1,maxWidth/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  const dataUrl=canvas.toDataURL('image/jpeg',.9);captures.push(dataUrl);const image=document.createElement('img');image.src=dataUrl;image.alt='Vue '+captures.length;document.querySelector('#scan-thumbnails')?.appendChild(image);
  const angle=Math.round(captures.length/targetCount*360),remaining=Math.max(0,targetCount-captures.length);document.querySelector('#scan-guidance').textContent=remaining?'Continuez autour de l’objet · '+angle+'°':'Tour complet terminé';document.querySelector('#scan-status').textContent=remaining?'Encore '+remaining+' photo'+(remaining>1?'s':'')+'. Gardez la même distance et un bon éclairage.':'Capture complète · prête pour la reconstruction 3D.';return captures.length;
}

export function reset(){captures.length=0;document.querySelector('#scan-thumbnails')?.replaceChildren();document.querySelector('#scan-guidance').textContent='Placez l’objet au centre';document.querySelector('#scan-status').textContent='Prenez des photos nettes en tournant progressivement autour de l’objet.';}
export function stop(){stream?.getTracks().forEach(track=>track.stop());stream=null;reset();}
