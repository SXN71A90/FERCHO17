let currentUser=null, videos=[], currentVideo=null, activeFilter="all";
const $=id=>document.getElementById(id);
async function api(url,options={}) {
  const res=await fetch(url,{credentials:"same-origin",...options});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"No se pudo completar la solicitud.");
  return data;
}
function safeText(el,text){el.textContent=text||""}
function showModal(id){$(id).hidden=false}
function closeModal(id){$(id).hidden=true}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
function updateAccount(){
  const area=$("accountArea"); area.innerHTML="";
  if(currentUser){
    const name=document.createElement("span");name.textContent="Hola, "+currentUser.username;name.style.cssText="align-self:center;color:#ddd;font-size:13px";
    const out=document.createElement("button");out.className="outline";out.textContent="Cerrar sesión";out.onclick=logout;
    area.append(name,out);
  }else{
    const login=document.createElement("button");login.className="outline";login.textContent="Iniciar sesión";login.onclick=()=>openAuth("login");
    const reg=document.createElement("button");reg.className="red";reg.textContent="Registrarse";reg.onclick=()=>openAuth("register");
    area.append(login,reg);
  }
}
function openAuth(mode){authMode=mode;$("authTitle").textContent=mode==="login"?"Iniciar sesión":"Crear cuenta";$("authSubtitle").textContent=mode==="login"?"Entra a tu cuenta LFC.":"Regístrate para publicar, comentar y dar likes."; $("authSubmit").textContent=mode==="login"?"Entrar":"Crear cuenta";$("switchAuth").firstChild.textContent=mode==="login"?"¿No tienes cuenta? ":"¿Ya tienes cuenta? ";$("switchAuthButton").textContent=mode==="login"?"Regístrate":"Inicia sesión";$("authError").textContent="";$("authPassword").value="";showModal("authModal");}
let authMode="login";
$("loginOpen").onclick=()=>openAuth("login");$("registerOpen").onclick=()=>openAuth("register");
$("switchAuthButton").onclick=()=>openAuth(authMode==="login"?"register":"login");
$("authForm").onsubmit=async e=>{e.preventDefault();$("authError").textContent="";try{
  const data=await api("/api/"+(authMode==="login"?"login":"register"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("authUsername").value,password:$("authPassword").value})});
  currentUser=data.user;updateAccount();closeModal("authModal");await loadVideos();
  if(currentVideo) refreshCurrentVideo();
}catch(err){$("authError").textContent=err.message;}};
async function logout(){try{await api("/api/logout",{method:"POST"});currentUser=null;updateAccount();activeFilter="all";document.querySelectorAll(".nav a").forEach(a=>a.classList.toggle("active",a.dataset.filter==="all"));await loadVideos();if(currentVideo)refreshCurrentVideo();}catch(e){alert(e.message)}}
async function loadVideos(){try{const data=await api("/api/videos");videos=data.videos;render();}catch(e){alert(e.message)}}
function render(){
  const term=$("searchInput").value.trim().toLowerCase();
  let list=videos.filter(v=>(v.title+" "+v.username+" "+v.description).toLowerCase().includes(term));
  if(activeFilter==="mine")list=list.filter(v=>currentUser&&v.userId===currentUser.id);
  $("videoGrid").innerHTML="";
  list.forEach(v=>{
    const card=document.createElement("article");card.className="video-card";
    const thumb=document.createElement("div");thumb.className="thumbnail";thumb.innerHTML='<span class="thumb-play">▶</span>';
    const title=document.createElement("div");title.className="card-title";safeText(title,v.title);
    const meta=document.createElement("div");meta.className="card-meta";safeText(meta,`${v.username} · ${v.views||0} vistas · ${v.likesCount||0} likes`);
    card.append(thumb,title,meta);card.onclick=()=>openVideo(v.id);$("videoGrid").append(card);
  });
  $("resultCount").textContent=`${list.length} video${list.length===1?"":"s"} en la comunidad`;
  $("emptyState").hidden=list.length>0;
  renderSearchSuggestions(list,term);
}
function renderSearchSuggestions(list,term){
  let box=$("searchSuggestions");
  if(!box){box=document.createElement("div");box.id="searchSuggestions";box.className="search-suggestions";$("searchForm").append(box);}
  box.innerHTML="";
  if(!term||document.activeElement!==$("searchInput")){box.hidden=true;return;}
  list.slice(0,6).forEach(v=>{
    const item=document.createElement("button");item.type="button";item.className="suggestion";
    const name=document.createElement("strong");safeText(name,v.title);
    const by=document.createElement("small");safeText(by,`${v.username} · ${v.views||0} vistas`);
    item.append(name,by);item.onclick=()=>{box.hidden=true;openVideo(v.id);};box.append(item);
  });
  box.hidden=list.length===0;
}
async function openVideo(id){
  currentVideo=videos.find(v=>v.id===id);if(!currentVideo)return;
  $("catalogView").hidden=true;$("playerView").hidden=false;
  $("mainVideo").src=currentVideo.url;$("mainVideo").load();
  safeText($("playingTitle"),currentVideo.title);
  safeText($("playingMeta"),`Publicado por ${currentVideo.username} · ${new Date(currentVideo.createdAt).toLocaleString()}`);
  safeText($("playingDescription"),currentVideo.description);
  $("deleteVideo").hidden=!(currentUser&&currentVideo.userId===currentUser.id);
  try{await api(`/api/videos/${id}/view`,{method:"POST"});}catch(e){}
  await loadVideos();
  currentVideo=videos.find(v=>v.id===id)||currentVideo;
  refreshCurrentVideo();
  await loadComments(id);
  renderUpNext();window.scrollTo({top:0,behavior:"smooth"});
}
function refreshCurrentVideo(){
  if(!currentVideo)return;
  const v=videos.find(x=>x.id===currentVideo.id)||currentVideo;currentVideo=v;
  safeText($("playingStats"),`▶ ${v.views||0} vistas     ♥ ${v.likesCount||0} likes`);
  $("likeButton").textContent=v.likedByMe?"♥ Te gusta":"♡ Me gusta";
  $("deleteVideo").hidden=!(currentUser&&v.userId===currentUser.id);
  renderUpNext();
}
function renderUpNext(){
  const box=$("upNextList");box.innerHTML="";
  videos.filter(v=>currentVideo&&v.id!==currentVideo.id).slice(0,8).forEach(v=>{
    const item=document.createElement("div");item.className="up-next-item";
    const thumb=document.createElement("div");thumb.className="up-next-thumb";thumb.textContent="▶";
    const info=document.createElement("div"),title=document.createElement("div"),meta=document.createElement("div");
    title.className="up-next-title";safeText(title,v.title);meta.className="up-next-meta";safeText(meta,`${v.username} · ${v.views||0} vistas`);
    info.append(title,meta);item.append(thumb,info);item.onclick=()=>openVideo(v.id);box.append(item);
  });
}
async function loadComments(id){
  $("commentsList").innerHTML="";$("commentError").textContent="";
  try{
    const data=await api(`/api/videos/${id}/comments`);
    $("commentsCount").textContent=`(${data.comments.length})`;
    data.comments.forEach(addCommentToPage);
  }catch(e){$("commentError").textContent=e.message;}
  $("commentText").placeholder=currentUser?"Escribe un comentario...":"Inicia sesión para comentar";
}
function addCommentToPage(c){
  const item=document.createElement("article");item.className="comment";
  const head=document.createElement("div");head.className="comment-head";
  const user=document.createElement("span");user.className="comment-user";safeText(user,c.username);
  const date=document.createElement("span");date.className="comment-date";safeText(date,new Date(c.createdAt).toLocaleString());
  const text=document.createElement("div");text.className="comment-text";safeText(text,c.text);
  head.append(user,date);item.append(head,text);$("commentsList").append(item);
}
$("commentForm").onsubmit=async e=>{
  e.preventDefault();$("commentError").textContent="";
  if(!currentUser){openAuth("login");$("authError").textContent="Inicia sesión para comentar.";return;}
  const text=$("commentText").value.trim();if(!text)return;
  $("commentSubmit").disabled=true;
  try{
    const data=await api(`/api/videos/${currentVideo.id}/comments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
    $("commentText").value="";addCommentToPage(data.comment);$("commentsCount").textContent=`(${data.commentsCount})`;
    const v=videos.find(x=>x.id===currentVideo.id);if(v)v.commentsCount=data.commentsCount;
  }catch(err){$("commentError").textContent=err.message;}
  $("commentSubmit").disabled=false;
};
$("likeButton").onclick=async()=>{
  if(!currentUser){openAuth("login");$("authError").textContent="Inicia sesión para dar like.";return;}
  try{await api(`/api/videos/${currentVideo.id}/like`,{method:"POST"});await loadVideos();refreshCurrentVideo();}
  catch(e){alert(e.message)}
};
$("searchForm").onsubmit=e=>{e.preventDefault();$("searchSuggestions").hidden=true;render()};
$("searchInput").oninput=render;
$("searchInput").onfocus=render;
document.addEventListener("click",e=>{if(!$("searchForm").contains(e.target)&&$("searchSuggestions"))$("searchSuggestions").hidden=true;});
document.querySelectorAll(".nav a").forEach(a=>a.onclick=e=>{e.preventDefault();activeFilter=a.dataset.filter;document.querySelectorAll(".nav a").forEach(x=>x.classList.toggle("active",x===a));$("catalogView").hidden=false;$("playerView").hidden=true;render()});
$("publishOpen").onclick=()=>{if(!currentUser){openAuth("login");$("authError").textContent="Inicia sesión o crea una cuenta para publicar.";return;}$("publishError").textContent="";$("publishForm").reset();$("uploadProgress").hidden=true;showModal("publishModal")};
$("publishForm").onsubmit=e=>{
 e.preventDefault();$("publishError").textContent="";
 const file=$("videoFile").files[0];if(!file){$("publishError").textContent="Selecciona un video.";return;}
 if(file.size>500*1024*1024){$("publishError").textContent="El archivo supera 500 MB.";return;}
 const title=$("videoTitle").value.trim();if(!title){$("publishError").textContent="Escribe un nombre para el video.";return;}
 const form=new FormData();form.append("title",title);form.append("description",$("videoDescription").value);form.append("video",file);
 const xhr=new XMLHttpRequest();xhr.open("POST","/api/videos");xhr.withCredentials=true;
 $("publishSubmit").disabled=true;$("publishSubmit").textContent="Subiendo...";$("uploadProgress").hidden=false;
 xhr.upload.onprogress=e=>{if(e.lengthComputable)$("progressBar").style.width=(e.loaded/e.total*100)+"%";};
 xhr.onload=async()=>{try{const result=JSON.parse(xhr.responseText);if(xhr.status>=200&&xhr.status<300){closeModal("publishModal");await loadVideos();openVideo(result.video.id);}else{$("publishError").textContent=result.error||"No se pudo publicar.";}}catch{$("publishError").textContent="Respuesta no válida del servidor.";}
 $("publishSubmit").disabled=false;$("publishSubmit").textContent="Publicar";};
 xhr.onerror=()=>{$("publishError").textContent="Error de conexión."; $("publishSubmit").disabled=false;$("publishSubmit").textContent="Publicar";};
 xhr.send(form);
};
$("backButton").onclick=()=>{$("mainVideo").pause();$("playerView").hidden=true;$("catalogView").hidden=false;render()};
$("deleteVideo").onclick=async()=>{if(!currentVideo||!confirm("¿Seguro que quieres eliminar este video?"))return;try{await api("/api/videos/"+currentVideo.id,{method:"DELETE"});$("mainVideo").pause();$("playerView").hidden=true;$("catalogView").hidden=false;await loadVideos();}catch(e){alert(e.message)}};
async function init(){try{const data=await api("/api/me");currentUser=data.user;}catch{}updateAccount();await loadVideos();}
init();