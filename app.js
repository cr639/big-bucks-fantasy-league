const $ = s => document.querySelector(s);
const initials = name => name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
const teamById = id => LEAGUE.teams.find(t=>t.id===id);

function generateRoundRobin(ids){
  const arr=[...ids]; const rounds=[]; const n=arr.length;
  for(let r=0;r<n-1;r++){
    const games=[];
    for(let i=0;i<n/2;i++) games.push([arr[i],arr[n-1-i]]);
    rounds.push(games);
    arr.splice(1,0,arr.pop());
  }
  return rounds;
}
const schedule=generateRoundRobin(LEAGUE.teams.map(t=>t.id));

function matchupKey(a,b){return `${Math.min(a,b)}-${Math.max(a,b)}`}
function getScores(week,a,b){const raw=(LEAGUE.scores[week]||{})[matchupKey(a,b)]; if(!raw) return [null,null]; return a<b?raw:[raw[1],raw[0]]}

function calculateStandings(){
  const stats={}; LEAGUE.teams.forEach(t=>stats[t.id]={...t,w:0,l:0,pf:0,pa:0,results:[]});
  schedule.forEach((games,wi)=>games.forEach(([a,b])=>{
    const [sa,sb]=getScores(wi+1,a,b); if(sa==null||sb==null)return;
    stats[a].pf+=sa;stats[a].pa+=sb;stats[b].pf+=sb;stats[b].pa+=sa;
    if(sa>sb){stats[a].w++;stats[b].l++;stats[a].results.push('W');stats[b].results.push('L')}
    else if(sb>sa){stats[b].w++;stats[a].l++;stats[b].results.push('W');stats[a].results.push('L')}
  }));
  const streak=s=>{if(!s.results.length)return '—';const x=s.results.at(-1);let c=0;for(let i=s.results.length-1;i>=0&&s.results[i]===x;i--)c++;return x+c};
  return Object.values(stats).map(s=>({...s,streak:streak(s)})).sort((a,b)=> b.w-a.w || a.l-b.l || b.pf-a.pf || a.name.localeCompare(b.name));
}

function renderMatchCard(a,b,week){
  const ta=teamById(a),tb=teamById(b),[sa,sb]=getScores(week,a,b);const st=calculateStandings();
  const ra=st.find(x=>x.id===a), rb=st.find(x=>x.id===b);
  const line=(t,s,r)=>`<div class="team-line"><div class="team-icon">${initials(t.name)}</div><div><div class="team-name">${t.name}</div><div class="team-record">${r.w}-${r.l} • ${t.owner}</div></div><div class="score ${s==null?'tbd':''}">${s==null?'TBD':s.toFixed(2)}</div></div>`;
  return `<article class="match-card"><div class="match-meta"><span>WEEK ${week}</span><span>${sa==null?'UPCOMING':'FINAL'}</span></div>${line(ta,sa,ra)}${line(tb,sb,rb)}</article>`;
}

function render(){
  $('#currentWeekLabel').textContent=`Week ${LEAGUE.currentWeek}`;
  const currentGames=schedule[LEAGUE.currentWeek-1]||[];
  $('#featuredMatchups').innerHTML=currentGames.slice(0,3).map(g=>renderMatchCard(g[0],g[1],LEAGUE.currentWeek)).join('');
  const standings=calculateStandings();
  $('#miniStandings').innerHTML=standings.slice(0,5).map((s,i)=>`<div class="mini-row"><div class="seed">${i+1}</div><div><strong>${s.name}</strong><div class="mini-pf">${s.pf.toFixed(2)} PF</div></div><div class="mini-record">${s.w}-${s.l}</div><div>${s.streak}</div></div>`).join('');
  const lead=standings[0]; $('#leagueLeader').innerHTML=`<div class="big-name">${lead.name}</div><p>${lead.owner}</p><div class="leader-stats"><div><span>RECORD</span><strong>${lead.w}-${lead.l}</strong></div><div><span>POINTS</span><strong>${lead.pf.toFixed(1)}</strong></div><div><span>STREAK</span><strong>${lead.streak}</strong></div></div>`;
  $('#standingsBody').innerHTML=standings.map((s,i)=>`<tr><td><span class="seed-pill">${i+1}</span></td><td><div class="team-cell"><span class="team-icon">${initials(s.name)}</span><div>${s.name}<div class="team-record">${s.owner}</div></div></div></td><td><strong>${s.w}</strong></td><td>${s.l}</td><td>${(s.w+s.l)?(s.w/(s.w+s.l)*100).toFixed(1)+'%':'—'}</td><td>${s.pf.toFixed(2)}</td><td>${s.pa.toFixed(2)}</td><td>${(s.pf-s.pa).toFixed(2)}</td><td>${s.streak}</td></tr>`).join('');
  $('#teamsGrid').innerHTML=LEAGUE.teams.map(t=>`<article class="team-card"><div class="team-icon">${initials(t.name)}</div><h3>${t.name}</h3><p>${t.owner}</p></article>`).join('');
  $('#weekSelect').innerHTML=schedule.map((_,i)=>`<option value="${i+1}" ${i+1===LEAGUE.currentWeek?'selected':''}>Week ${i+1}</option>`).join('')+'<option value="16">Week 16 • Semifinals</option><option value="17">Week 17 • Championship</option>';
  renderWeek(LEAGUE.currentWeek);
}
function renderWeek(week){
  if(week<=15) $('#scheduleGrid').innerHTML=schedule[week-1].map(g=>renderMatchCard(g[0],g[1],week)).join('');
  else $('#scheduleGrid').innerHTML=`<article class="match-card"><div class="match-meta"><span>WEEK ${week}</span><span>PLAYOFFS</span></div><h3>${week===16?'#1 vs #4 • #2 vs #3':'Championship'}</h3><p>Playoff matchups will populate after the regular season.</p></article>`;
}
$('#weekSelect').addEventListener('change',e=>renderWeek(Number(e.target.value)));
$('.nav-toggle').addEventListener('click',()=>$('.main-nav').classList.toggle('open'));
document.querySelectorAll('.main-nav a').forEach(a=>a.addEventListener('click',()=>$('.main-nav').classList.remove('open')));
render();
