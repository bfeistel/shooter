// Mini-FPS (getrennte Datei) — Änderungen: Zombies kollisionsprüfen, labyrinth-map, Ziel verschiebbar, kein Schießen durch Wände

// Elemente
const canvas = document.getElementById('viewport');
const ctx = canvas.getContext('2d');
const elLevel = document.getElementById('level');
const elHealth = document.getElementById('health');
const elAmmo = document.getElementById('ammo');
const elObjective = document.getElementById('objective');
const msg = document.getElementById('message');
const crosshair = document.getElementById('crosshair');

// Farbanpassung: einfarbiger Boden
const floorColor = '#2e2e2e'; // grau

// Resize
function resize(){canvas.width = window.innerWidth; canvas.height = window.innerHeight - 56}
window.addEventListener('resize', resize); resize();

// Spielzustand
let level = 1;
let map = [];
let player = {x:2.5,y:2.5,angle:0,pitch:0,moveSpeed:2.6,health:100};
let keys = {};
let zombies = [];
let lastTime = performance.now();
// Minimap configuration
const minimapTileSize = 10; // pixel per tile in the minimap (larger minimap)
const minimapMargin = 8;   // distance from top-left corner

// Waffen
const weaponList = ['rifle','pistol'];
let currentWeaponIndex = 0;
const weapons = {
  rifle:{mag:30,max:30,damage:25,rof:120,range:12,lastShot:0},
  pistol:{mag:12,max:12,damage:12,rof:220,range:7,lastShot:0}
};

// Pointer lock support and fallback
let pointerLockSupported = true;
let isPointerLocked = false;
let freePointerMode = false; // wenn true: Maus frei bewegen (normaler Cursor), Spiel nicht dreht sich
let sandboxBlockedPointerLock = false;
let lastMouseX = window.innerWidth/2, lastMouseY = (window.innerHeight-56)/2; // Fallback

// ---------- NEU: Maze-Generator (Recursive backtracker) ----------
// Generiert ein Labyrinth (1 = Wand, 0 = Boden). Breite/Höhe sollten odd sein für sauberes Labyrinth.
function generateMaze(width, height){
  if(width % 2 === 0) width++;
  if(height % 2 === 0) height++;
  const w = width, h = height;
  const grid = Array.from({length:h}, ()=>Array.from({length:w}, ()=>1));
  const stack = [];
  const start = {x:1,y:1};
  grid[start.y][start.x] = 0;
  stack.push(start);
  const dirs = [{dx:0,dy:-2},{dx:2,dy:0},{dx:0,dy:2},{dx:-2,dy:0}];
  while(stack.length){
    const cur = stack[stack.length-1];
    const neighbors = [];
    for(const d of dirs){
      const nx = cur.x + d.dx, ny = cur.y + d.dy;
      if(nx>0 && nx<w-1 && ny>0 && ny<h-1 && grid[ny][nx]===1){
        neighbors.push({x:nx,y:ny,between:{x:cur.x + d.dx/2, y:cur.y + d.dy/2}});
      }
    }
    if(neighbors.length===0){ stack.pop(); continue; }
    const n = neighbors[Math.floor(Math.random()*neighbors.length)];
    grid[n.y][n.x] = 0;
    grid[n.between.y][n.between.x] = 0;
    stack.push({x:n.x,y:n.y});
  }
  return grid;
}

// Utility
function cloneMap(m){return m.map(r=>r.slice());}
function isWall(x,y){const cx=Math.floor(x), cy=Math.floor(y); if(cy<0||cx<0||cy>=map.length||cx>=map[0].length) return true; return map[cy][cx]===1}

// Startlevel & Platzierung
function placePlayerAtStart(){for(let y=0;y<map.length;y++)for(let x=0;x<map[0].length;x++)if(map[y][x]===0){player.x=x+0.5; player.y=y+0.5; return}}

// Objective: zufällig auf begehbarem Tile platzieren (Tile = 2)
function placeObjective(){
  for(let y=0;y<map.length;y++) for(let x=0;x<map[0].length;x++) if(map[y][x]===2) map[y][x]=0;
  const floors=[];
  for(let y=0;y<map.length;y++) for(let x=0;x<map[0].length;x++) if(map[y][x]===0) floors.push({x,y});
  if(floors.length===0) return;
  const choice = floors[Math.floor(Math.random()*floors.length)];
  map[choice.y][choice.x]=2;
}

// Spawn zombies auf begehbaren Tiles, mit Mindestabstand zum Spieler
function spawnZombies(n){
  zombies = [];
  const h=map.length, w=map[0].length;
  const floors=[];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(map[y][x]===0) floors.push({x,y});
  for(let i=0;i<n;i++){
    let choice, tries=0;
    do{
      choice = floors[Math.floor(Math.random()*floors.length)];
      tries++;
    } while((Math.hypot(choice.x+0.5-player.x, choice.y+0.5-player.y) < 3 || (choice.x===Math.floor(player.x) && choice.y===Math.floor(player.y))) && tries<200);
    zombies.push({x:choice.x+0.5, y:choice.y+0.5, hp:30+level*5, speed:0.8+level*0.15});
  }
}

// Line-of-sight: prüft, ob eine Wand zwischen (x1,y1) und (x2,y2) ist.
// Nutzt sampling entlang der Linie (fein genug für unsere Tile-Größe).
function lineOfSight(x1,y1,x2,y2){
  const dx = x2 - x1; const dy = y2 - y1; const dist = Math.hypot(dx,dy);
  const steps = Math.ceil(dist / 0.08);
  for(let i=0;i<=steps;i++){
    const t = i/steps;
    const xi = x1 + dx*t; const yi = y1 + dy*t;
    if(isWall(xi, yi)) return false;
  }
  return true;
}

// StartLevel: Map-Größe wächst mit Level, Map = Labyrinth, Ziel wird neu platziert
function startLevel(n){
  level = n;
  elLevel.textContent = 'Level: '+level;
  // Map-Größe (ungerade Werte, Begrenzung)
  const mapW = Math.min(61, 11 + (level-1)*4);
  const mapH = Math.min(41, 7 + Math.floor((level-1)*2.5));
  map = generateMaze(mapW, mapH);
  placePlayerAtStart();
  placeObjective();
  spawnZombies(3 + level*2);
  weapons.rifle.mag = weapons.rifle.max; weapons.pistol.mag = weapons.pistol.max; player.health = 100;
  elObjective.textContent='Ziel: Gebäude finden';
  hideMessage();
}

// Messages
let msgTimeout = null;
function showMessage(t,ms=1000){msg.textContent=t; msg.classList.remove('hidden'); if(msgTimeout) clearTimeout(msgTimeout); if(ms) msgTimeout = setTimeout(()=>{msg.classList.add('hidden')}, ms)}
function hideMessage(){msg.classList.add('hidden'); if(msgTimeout) clearTimeout(msgTimeout)}

// Input (wie vorher)
window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()] = true; if(e.key==='Escape'){ toggleFreePointerMode(true); } if(e.key.toLowerCase()==='r') reload(); if(e.key.toLowerCase()==='q') switchWeapon(); if(e.key.toLowerCase()==='e') checkObjective(); });
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });

canvas.addEventListener('mousedown', e=>{
  if(freePointerMode) return;
  if(e.button === 0) tryFireCurrent();
});
canvas.addEventListener('contextmenu', e=>{ e.preventDefault(); });

// Mausbewegung — unterstützt pointer lock und fallback
function onMouseMove(e){
  if(freePointerMode) return;
  let movX = 0, movY = 0;
  if(typeof e.movementX === 'number'){
    movX = e.movementX;
    movY = e.movementY || 0;
  } else {
    movX = (e.clientX - lastMouseX);
    movY = (e.clientY - lastMouseY);
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
  player.angle += movX * 0.0025;
  player.pitch = Math.max(-Math.PI/4, Math.min(Math.PI/4, player.pitch - movY * 0.0025));
}
window.addEventListener('mousemove', onMouseMove);

// Pointer lock helpers (unverändert)
function tryRequestPointerLock(){
  if(!canvas.requestPointerLock) { pointerLockSupported = false; return; }
  try{
    canvas.requestPointerLock();
  } catch(err){
    pointerLockSupported = false;
    sandboxBlockedPointerLock = true;
    showMessage('PointerLock blockiert (sandbox). Fallback-Modus aktiviert. Setze allow-pointer-lock auf das iframe, wenn möglich.',5000);
    enableFallbackCursorCapture();
  }
}
document.addEventListener('pointerlockchange', ()=>{
  isPointerLocked = document.pointerLockElement === canvas;
  if(isPointerLocked){ freePointerMode = false; canvas.classList.add('cursor-hidden'); crosshair.style.display='block'; }
  else { canvas.classList.remove('cursor-hidden'); if(!sandboxBlockedPointerLock) { freePointerMode = true; crosshair.style.display='none'; } }
});
function enableFallbackCursorCapture(){ pointerLockSupported = false; freePointerMode = false; canvas.classList.add('cursor-hidden'); crosshair.style.display='block'; }
function toggleFreePointerMode(forceFree=false){
  if(forceFree){
    freePointerMode = true;
    crosshair.style.display='none';
    canvas.classList.remove('cursor-hidden');
    try { if(document.exitPointerLock) document.exitPointerLock(); } catch(e){}
    return;
  }
  freePointerMode = !freePointerMode;
  if(freePointerMode){ crosshair.style.display='none'; canvas.classList.remove('cursor-hidden'); try{ if(document.exitPointerLock) document.exitPointerLock(); }catch(e){} }
  else { if(pointerLockSupported) tryRequestPointerLock(); else enableFallbackCursorCapture(); }
}

// Waffenfunktionen: Treffer nur bei Sichtlinie zum Zombie
function currentWeapon(){ return weaponList[currentWeaponIndex]; }
function switchWeapon(){ currentWeaponIndex = (currentWeaponIndex+1) % weaponList.length; showMessage('Waffe: '+currentWeapon(),800); }
function tryFireCurrent(){ const wName = currentWeapon(); const w = weapons[wName]; const now = performance.now(); if(now - w.lastShot < w.rof) return; if(w.mag<=0){ showMessage('Nachladen! (R)',800); return; } w.lastShot = now; w.mag--; elAmmo.textContent = `Gewehr: ${weapons.rifle.mag} | Pistole: ${weapons.pistol.mag}`;
  const hit = zombies.map(z=>{ const ang = Math.atan2(z.y-player.y,z.x-player.x); let diff = Math.abs(normalizeAngle(ang - player.angle)); const dist = Math.hypot(z.x-player.x,z.y-player.y); return {z,diff,dist}; }).filter(h=>h.dist <= weapons[wName].range && h.diff < 0.25).sort((a,b)=>a.dist-b.dist)[0];
  if(hit){
    if(lineOfSight(player.x, player.y, hit.z.x, hit.z.y)){
      hit.z.hp -= w.damage; if(hit.z.hp<=0) showMessage('Zombie erledigt!',400);
    } else {
      showMessage('Kein Treffer (Wand im Weg).',700);
    }
  }
}
function reload(){ const wName = currentWeapon(); weapons[wName].mag = weapons[wName].max; elAmmo.textContent = `Gewehr: ${weapons.rifle.mag} | Pistole: ${weapons.pistol.mag}`; showMessage('Nachgeladen',700); }

// Objective
function findObjective(){ for(let y=0;y<map.length;y++) for(let x=0;x<map[0].length;x++) if(map[y][x]===2) return {x:x+0.5,y:y+0.5}; return null }
function checkObjective(){ const obj = findObjective(); if(!obj) return; const d = Math.hypot(player.x-obj.x, player.y-obj.y); if(d < 1.2) { showMessage('Gebäude erreicht! Nächstes Level...',1200); startLevel(level+1); } else { showMessage('Noch zu weit weg.',900); } }

// Spiel-Loop
function update(dt){
  let dx=0, dy=0; const speed = player.moveSpeed * dt;
  if(keys['w']){ dx += Math.cos(player.angle) * speed; dy += Math.sin(player.angle) * speed; }
  if(keys['s']){ dx -= Math.cos(player.angle) * speed; dy -= Math.sin(player.angle) * speed; }
  if(keys['a']){ dx += Math.cos(player.angle - Math.PI/2) * speed; dy += Math.sin(player.angle - Math.PI/2) * speed; }
  if(keys['d']){ dx += Math.cos(player.angle + Math.PI/2) * speed; dy += Math.sin(player.angle + Math.PI/2) * speed; }
  movePlayer(dx,dy);

  // Zombies: einfache Kollisionsprüfung beim Bewegen, damit sie nicht durch Wände laufen
  for(const z of zombies){
    const vx = player.x - z.x;
    const vy = player.y - z.y;
    const dist = Math.hypot(vx,vy);
    if(dist>0.1){
      const nx = z.x + (vx/dist) * z.speed * dt;
      const ny = z.y + (vy/dist) * z.speed * dt;
      if(!isWall(nx, z.y)) z.x = nx;
      if(!isWall(z.x, ny)) z.y = ny;
    }
    if(dist < 0.7){ player.health -= 12*dt; }
  }

  zombies = zombies.filter(z => z.hp > 0);
  elHealth.textContent = 'Leben: ' + Math.max(0, Math.floor(player.health));
  elAmmo.textContent = `Gewehr: ${weapons.rifle.mag} | Pistole: ${weapons.pistol.mag}`;
  if(player.health <= 0){ showMessage('Du bist gestorben! Level zurückgesetzt.',1500); startLevel(1); }
}

function movePlayer(dx,dy){ const nx = player.x + dx, ny = player.y + dy; if(!isWall(nx, player.y)) player.x = nx; if(!isWall(player.x, ny)) player.y = ny; }

function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const H = canvas.height, W = canvas.width;
  const horizon = Math.max(0, Math.min(H, H/2 + Math.tan(player.pitch) * H));

  // Himmel (oben)
  ctx.fillStyle = '#88b';
  ctx.fillRect(0,0,W,horizon);

  // Einfarbiger Boden (unten)
  ctx.fillStyle = floorColor;
  ctx.fillRect(0,horizon,W,H - horizon);

  const fov = Math.PI/3; 
  const numRays = Math.min(200, Math.floor(W/2));
  for(let i=0;i<numRays;i++){ 
    const rayScreenPos = (i/numRays) - 0.5; 
    const rayAngle = player.angle + rayScreenPos * fov; 
    let distance=0, hit=false, hitTile=0; 
    let step=0.02; 
    let rx=player.x, ry=player.y; 
    while(!hit && distance < 20){ 
      distance += step; 
      rx = player.x + Math.cos(rayAngle)*distance; 
      ry = player.y + Math.sin(rayAngle)*distance; 
      const cx=Math.floor(rx), cy=Math.floor(ry); 
      if(cy<0||cx<0||cy>=map.length||cx>=map[0].length){ hit=true; hitTile=1; break } 
      const tile = map[cy][cx]; 
      if(tile===1 || tile===2){ hit=true; hitTile=tile; break } 
    }
    const corrected = distance * Math.cos(rayAngle - player.angle); 
    const wallHeight = Math.min(10000, (H*1.2) / Math.max(0.0001, corrected)); 
    const col = i * (W/numRays);
    if(hit){
      ctx.fillStyle = hitTile===2 ? '#aa4' : '#6b6';
      ctx.fillRect(col, horizon - wallHeight/2, Math.ceil(W/numRays)+1, wallHeight);
      const shade = Math.min(0.8, corrected / 20);
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fillRect(col, horizon - wallHeight/2, Math.ceil(W/numRays)+1, wallHeight);
    }
  }
  // Zombies als Billboards — nur rendern, wenn Line-of-Sight vorhanden (Verstecken hinter Wänden)
  for(const z of zombies){
    if(!lineOfSight(player.x, player.y, z.x, z.y)) continue; // nicht sichtbar durch Wände
    const vx = z.x - player.x, vy = z.y - player.y; 
    const dist = Math.hypot(vx,vy); 
    const ang = normalizeAngle(Math.atan2(vy,vx) - player.angle); 
    if(Math.abs(ang) < fov/2 && dist>0.4){ 
      const screenX = (0.5 + (ang / (fov)) ) * W; 
      const size = Math.min(H*1.2, (H*0.9) / dist); 
      const y = horizon - size/2;
      const hpRatio = Math.max(0, z.hp) / (30+level*5);
      ctx.fillStyle = `rgba(${Math.floor(200*(1-hpRatio)+55)},${Math.floor(60*hpRatio+60)},${Math.floor(60*hpRatio+20)},1)`;
      ctx.fillRect(screenX - size/4, y, size/2, size);
      const zShade = Math.min(0.8, dist / 20);
      ctx.fillStyle = `rgba(0,0,0,${zShade})`;
      ctx.fillRect(screenX - size/4, y, size/2, size);
      ctx.fillStyle = '#222';
      ctx.fillRect(screenX - size/4, y-6, size/2,4);
      ctx.fillStyle = '#f44';
      ctx.fillRect(screenX - size/4, y-6, (size/2)*hpRatio,4);
    }
  }

  drawMinimap();
}

function drawMinimap(){
  const tileSize = minimapTileSize;
  const mapW = map[0].length * tileSize;
  const mapH = map.length * tileSize;
  const offsetX = minimapMargin;
  const offsetY = minimapMargin;

  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#000';
  ctx.fillRect(offsetX-2, offsetY-2, mapW+4, mapH+4);

  for(let y=0;y<map.length;y++){
    for(let x=0;x<map[0].length;x++){
      const tile = map[y][x];
      if(tile===1) ctx.fillStyle='#444';
      else ctx.fillStyle='#222';
      ctx.fillRect(offsetX + x*tileSize, offsetY + y*tileSize, tileSize, tileSize);
    }
  }

  // Player
  const px = offsetX + player.x*tileSize;
  const py = offsetY + player.y*tileSize;
  ctx.fillStyle = '#0ff';
  ctx.beginPath();
  ctx.arc(px, py, tileSize/2, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = '#0ff';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(player.angle)*tileSize, py + Math.sin(player.angle)*tileSize);
  ctx.stroke();
  ctx.restore();
}

function normalizeAngle(a){ while(a<=-Math.PI) a+=2*Math.PI; while(a>Math.PI) a-=2*Math.PI; return a }

// Main loop
function loop(){ const now = performance.now(); const dt = (now - lastTime)/1000; lastTime = now; update(dt); render(); requestAnimationFrame(loop); }

// Initialization & pointer-lock availability check (wie vorher)
canvas.addEventListener('click', ()=>{
  if(freePointerMode && !pointerLockSupported){ freePointerMode = false; enableFallbackCursorCapture(); showMessage('Spiel übernommen (Fallback).',800); return; }
  if(pointerLockSupported) tryRequestPointerLock(); else enableFallbackCursorCapture();
});
crosshair.style.display = 'none';
try{ if(!HTMLCanvasElement.prototype.requestPointerLock) pointerLockSupported = false; } catch(e){ pointerLockSupported = false; }
if(!pointerLockSupported){ showMessage('PointerLock nicht verfügbar — Fallback-Modus aktiv. Drücke ESC, um Maus frei zu geben.',5000); }

// Start Spiel
startLevel(1);
loop();
