const $ = (s) => document.querySelector(s);

const SHEETS = {
  teams: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQIrLxuCpinaLJ9BnCCszGe-NdecO_2ogrqDq_qcgpdgJyx1APFvJuBcCQKMVGU4_QXDW1fitmnWBKU/pub?gid=0&single=true&output=csv',
  schedule: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQIrLxuCpinaLJ9BnCCszGe-NdecO_2ogrqDq_qcgpdgJyx1APFvJuBcCQKMVGU4_QXDW1fitmnWBKU/pub?gid=1192672834&single=true&output=csv',
  scores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQIrLxuCpinaLJ9BnCCszGe-NdecO_2ogrqDq_qcgpdgJyx1APFvJuBcCQKMVGU4_QXDW1fitmnWBKU/pub?gid=552252590&single=true&output=csv'
};

let league = {
  teams: [],
  schedule: {},
  scores: {},
  currentWeek: 1
};

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] ?? '').trim();
    });
    return record;
  });
}

async function fetchCSV(url) {
  // Try the exact published Google Sheets URL first. If Google has a transient
  // cache/redirect issue, retry once with a cache-buster.
  const tryFetch = async (requestUrl) => {
    const response = await fetch(requestUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Google Sheet request failed (${response.status})`);
    return parseCSV(await response.text());
  };

  try {
    return await tryFetch(url);
  } catch (firstError) {
    const separator = url.includes('?') ? '&' : '?';
    return await tryFetch(`${url}${separator}_=${Date.now()}`);
  }
}

function initials(name) {
  return (name || 'TBD')
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function teamById(id) {
  return league.teams.find((team) => team.id === Number(id));
}

function scoreFor(week, teamId) {
  const key = `${Number(week)}-${Number(teamId)}`;
  return Object.prototype.hasOwnProperty.call(league.scores, key)
    ? league.scores[key]
    : null;
}

function inferCurrentWeek() {
  // Before any scores are entered, the league is on Week 1.
  if (Object.keys(league.scores).length === 0) return 1;

  for (let week = 1; week <= 15; week++) {
    const games = league.schedule[week] || [];

    // Never skip past a week if its schedule data is missing.
    if (!games.length) return week;

    const weekComplete = games.every(([a, b]) =>
      scoreFor(week, a) !== null && scoreFor(week, b) !== null
    );

    if (!weekComplete) return week;
  }

  return 15;
}

function calculateStandings() {
  const stats = {};

  league.teams.forEach((team) => {
    stats[team.id] = {
      ...team,
      w: 0,
      l: 0,
      t: 0,
      pf: 0,
      pa: 0,
      results: []
    };
  });

  for (let week = 1; week <= 15; week++) {
    const games = league.schedule[week] || [];

    games.forEach(([a, b]) => {
      const sa = scoreFor(week, a);
      const sb = scoreFor(week, b);
      if (sa === null || sb === null || !stats[a] || !stats[b]) return;

      stats[a].pf += sa;
      stats[a].pa += sb;
      stats[b].pf += sb;
      stats[b].pa += sa;

      // A 0 represents a missed contest entry. If both owners miss, both take a loss.
      if (sa === 0 && sb === 0) {
        stats[a].l++;
        stats[b].l++;
        stats[a].results.push('L');
        stats[b].results.push('L');
      } else if (sa > sb) {
        stats[a].w++;
        stats[b].l++;
        stats[a].results.push('W');
        stats[b].results.push('L');
      } else if (sb > sa) {
        stats[b].w++;
        stats[a].l++;
        stats[b].results.push('W');
        stats[a].results.push('L');
      } else {
        stats[a].t++;
        stats[b].t++;
        stats[a].results.push('T');
        stats[b].results.push('T');
      }
    });
  }

  const streak = (stat) => {
    if (!stat.results.length) return '—';
    const latest = stat.results.at(-1);
    let count = 0;
    for (let i = stat.results.length - 1; i >= 0 && stat.results[i] === latest; i--) count++;
    return `${latest}${count}`;
  };

  const headToHeadCompare = (a, b) => {
    for (let week = 1; week <= 15; week++) {
      const games = league.schedule[week] || [];
      const matchup = games.find(([x, y]) =>
        (x === a.id && y === b.id) || (x === b.id && y === a.id)
      );
      if (!matchup) continue;

      const sa = scoreFor(week, a.id);
      const sb = scoreFor(week, b.id);
      if (sa === null || sb === null || sa === sb) return 0;
      return sa > sb ? -1 : 1;
    }
    return 0;
  };

  return Object.values(stats)
    .map((stat) => {
      const games = stat.w + stat.l + stat.t;
      const winPct = games ? (stat.w + 0.5 * stat.t) / games : 0;
      return { ...stat, winPct, streak: streak(stat) };
    })
    .sort((a, b) =>
      b.winPct - a.winPct ||
      b.pf - a.pf ||
      headToHeadCompare(a, b) ||
      a.name.localeCompare(b.name)
    );
}

function totalPointsFor(teamId) {
  let total = 0;
  for (let week = 1; week <= 17; week++) {
    const score = scoreFor(week, teamId);
    if (score !== null) total += score;
  }
  return total;
}

function recordText(stat) {
  return `${stat.w}-${stat.l}-${stat.t}`;
}

function renderMatchCard(a, b, week, standings) {
  const teamA = teamById(a);
  const teamB = teamById(b);
  if (!teamA || !teamB) return '';

  const scoreA = scoreFor(week, a);
  const scoreB = scoreFor(week, b);
  const statA = standings.find((x) => x.id === a) || { w: 0, l: 0, t: 0 };
  const statB = standings.find((x) => x.id === b) || { w: 0, l: 0, t: 0 };
  const final = scoreA !== null && scoreB !== null;
  const winnerA = final && scoreA > scoreB;
  const winnerB = final && scoreB > scoreA;

  const line = (team, score, stat, isWinner) => `
    <div class="team-line ${isWinner ? 'winner' : ''}">
      <div class="team-icon">${initials(team.abbreviation || team.name)}</div>
      <div>
        <div class="team-name">${team.name}</div>
        <div class="team-record">${recordText(stat)}${team.owner ? ` • ${team.owner}` : ''}</div>
      </div>
      <div class="score ${score === null ? 'tbd' : ''}">${score === null ? 'TBD' : score.toFixed(2)}</div>
    </div>`;

  return `
    <article class="match-card">
      <div class="match-meta"><span>WEEK ${week}</span><span>${final ? 'FINAL' : 'UPCOMING'}</span></div>
      ${line(teamA, scoreA, statA, winnerA)}
      ${line(teamB, scoreB, statB, winnerB)}
    </article>`;
}
function renderWeek(week) {
  const standings = calculateStandings();
  if (week <= 15) {
    const games = league.schedule[week] || [];
    $('#scheduleGrid').innerHTML = games.length
      ? games.map(([a, b]) => renderMatchCard(a, b, week, standings)).join('')
      : '<article class="match-card"><h3>Schedule coming soon</h3></article>';
  } else {
    $('#scheduleGrid').innerHTML = `
      <article class="match-card">
        <div class="match-meta"><span>WEEK ${week}</span><span>PLAYOFFS</span></div>
        <h3>${week === 16 ? '#1 vs #4 • #2 vs #3' : 'Championship'}</h3>
        <p>Playoff matchups will populate after the regular season.</p>
      </article>`;
  }
}

function render() {
  const standings = calculateStandings();
  const currentGames = league.schedule[league.currentWeek] || [];
  const currentWeekScores = league.teams
    .map((team) => ({ team, score: scoreFor(league.currentWeek, team.id) }))
    .filter((item) => item.score !== null)
    .sort((a, b) => b.score - a.score);

  const seasonPoints = league.teams.map((team) => ({ ...team, totalPoints: totalPointsFor(team.id) })).sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
  const leader = standings[0];
  const pointsLeader = seasonPoints[0];
  const weeklyLeader = currentWeekScores[0];
  const completedGames = currentGames.filter(([a, b]) => scoreFor(league.currentWeek, a) !== null && scoreFor(league.currentWeek, b) !== null).length;

  $('#currentWeekLabel').textContent = `Week ${league.currentWeek}`;
  $('#weekStatusText').textContent = completedGames
    ? `${completedGames} of ${currentGames.length} matchups final.`
    : 'All eight head-to-head matchups.';

  $('#featuredMatchups').innerHTML = currentGames.length
    ? currentGames.map(([a, b]) => renderMatchCard(a, b, league.currentWeek, standings)).join('')
    : '<article class="match-card"><h3>Schedule coming soon</h3></article>';

  $('#weeklyHighScore').innerHTML = weeklyLeader ? `
    <div class="stat-main">${weeklyLeader.team.name}</div>
    <div class="stat-sub"><span class="stat-value">${weeklyLeader.score.toFixed(2)}</span> DK points • Week ${league.currentWeek}</div>` : `
    <div class="stat-main">Up for grabs</div>
    <div class="stat-sub">Week ${league.currentWeek} scores have not been posted yet.</div>`;

  $('#seasonPointsLeader').innerHTML = pointsLeader && pointsLeader.totalPoints > 0 ? `
    <div class="stat-main">${pointsLeader.name}</div>
    <div class="stat-sub"><span class="stat-value">${pointsLeader.totalPoints.toFixed(2)}</span> total DK points</div>` : `
    <div class="stat-main">Season starts soon</div>
    <div class="stat-sub">Points leader will appear after Week 1.</div>`;

  $('#numberOneSeed').innerHTML = leader ? `
    <div class="stat-main">${leader.name}</div>
    <div class="stat-sub"><span class="stat-value">${recordText(leader)}</span> • ${leader.pf.toFixed(2)} PF</div>` : '<div class="loading-note">Waiting for league data…</div>';

  const playoffRows = standings.slice(0, 4).map((stat, index) => `
    <div class="playoff-row">
      <div class="playoff-seed">${index + 1}</div>
      <div><div class="playoff-team">${stat.name}</div><div class="playoff-meta">${stat.pf.toFixed(2)} PF • ${stat.streak}</div></div>
      <div class="playoff-record">${recordText(stat)}</div>
    </div>`).join('');
  const bubble = standings[4];
  $('#playoffPicture').innerHTML = playoffRows + (bubble ? `
    <div class="cut-line">PLAYOFF CUT</div>
    <div class="playoff-row">
      <div class="playoff-seed" style="background:#f2dfcf;color:#d95f13">5</div>
      <div><div class="playoff-team">${bubble.name}</div><div class="playoff-meta">First team out • ${bubble.pf.toFixed(2)} PF</div></div>
      <div class="playoff-record">${recordText(bubble)}</div>
    </div>` : '');

  $('#leagueLeader').innerHTML = leader ? `
    <div class="big-name">${leader.name}</div>
    <p>${leader.owner || 'Owner TBD'}</p>
    <div class="leader-stats">
      <div><span>RECORD</span><strong>${recordText(leader)}</strong></div>
      <div><span>POINTS</span><strong>${leader.pf.toFixed(1)}</strong></div>
      <div><span>STREAK</span><strong>${leader.streak}</strong></div>
    </div>` : '';

  $('#standingsBody').innerHTML = standings.map((stat, index) => `
    <tr>
      <td><span class="seed-pill">${index + 1}</span></td>
      <td><div class="team-cell"><span class="team-icon">${initials(stat.abbreviation || stat.name)}</span><div>${stat.name}<div class="team-record">${stat.owner || ''}</div></div></div></td>
      <td><strong>${stat.w}</strong></td>
      <td>${stat.l}</td>
      <td>${stat.t}</td>
      <td>${(stat.w + stat.l + stat.t) ? `${(stat.winPct * 100).toFixed(1)}%` : '—'}</td>
      <td>${stat.pf.toFixed(2)}</td>
      <td>${stat.pa.toFixed(2)}</td>
      <td>${(stat.pf - stat.pa).toFixed(2)}</td>
      <td>${stat.streak}</td>
    </tr>`).join('');

  $('#teamsGrid').innerHTML = league.teams.map((team) => `
    <article class="team-card">
      <div class="team-icon">${initials(team.abbreviation || team.name)}</div>
      <h3>${team.name}</h3>
      <p>${team.owner || 'Owner TBD'}</p>
    </article>`).join('');

  $('#weekSelect').innerHTML = Array.from({ length: 15 }, (_, index) => {
    const week = index + 1;
    return `<option value="${week}" ${week === league.currentWeek ? 'selected' : ''}>Week ${week}</option>`;
  }).join('') + '<option value="16">Week 16 • Semifinals</option><option value="17">Week 17 • Championship</option>';

  renderWeek(league.currentWeek);
}
function fallbackLeague() {
  const fallbackTeams = typeof LEAGUE !== 'undefined' && Array.isArray(LEAGUE.teams)
    ? LEAGUE.teams.map((team) => ({ ...team, abbreviation: '' }))
    : Array.from({ length: 16 }, (_, index) => ({
        id: index + 1,
        name: `Team ${index + 1}`,
        owner: '',
        abbreviation: ''
      }));

  const ids = fallbackTeams.map((team) => team.id);
  const rotation = [...ids];
  const fallbackSchedule = {};

  for (let round = 1; round <= ids.length - 1; round++) {
    fallbackSchedule[round] = [];
    for (let i = 0; i < ids.length / 2; i++) {
      fallbackSchedule[round].push([rotation[i], rotation[ids.length - 1 - i]]);
    }
    rotation.splice(1, 0, rotation.pop());
  }

  return {
    teams: fallbackTeams,
    schedule: fallbackSchedule,
    scores: {},
    currentWeek: 1
  };
}

async function loadLeague() {
  const backup = fallbackLeague();
  const results = await Promise.allSettled([
    fetchCSV(SHEETS.teams),
    fetchCSV(SHEETS.schedule),
    fetchCSV(SHEETS.scores)
  ]);

  const [teamsResult, scheduleResult, scoresResult] = results;
  const warnings = [];

  let teams = backup.teams;
  if (teamsResult.status === 'fulfilled') {
    const liveTeams = teamsResult.value
      .map((row) => ({
        id: Number(row['Team ID']),
        name: row['Team Name'] || `Team ${row['Team ID']}`,
        owner: row['Owner Name'] || '',
        abbreviation: row['Abbreviation'] || ''
      }))
      .filter((team) => Number.isFinite(team.id));

    if (liveTeams.length) {
      teams = liveTeams;
      if (liveTeams.length !== 16) warnings.push(`Teams feed returned ${liveTeams.length} teams instead of 16.`);
    } else {
      warnings.push('Teams feed was reachable but contained no usable teams.');
    }
  } else {
    console.error('Teams feed failed:', teamsResult.reason);
    warnings.push('Team names could not be loaded from Google Sheets.');
  }

  let schedule = backup.schedule;

  if (scheduleResult.status === 'fulfilled') {
    const liveSchedule = {};

    const normalizeHeader = (value) =>
      String(value || '')
        .replace(/^\uFEFF/, '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const getValue = (row, wantedHeader) => {
      const wanted = normalizeHeader(wantedHeader);

      const matchingKey = Object.keys(row).find(
        (key) => normalizeHeader(key) === wanted
      );

      return matchingKey ? row[matchingKey] : '';
    };

    scheduleResult.value.forEach((row) => {
      const week = Number(getValue(row, 'Week'));
      const team1 = Number(getValue(row, 'Team 1 ID'));
      const team2 = Number(getValue(row, 'Team 2 ID'));

      if (
        !Number.isFinite(week) ||
        !Number.isFinite(team1) ||
        !Number.isFinite(team2) ||
        week < 1 ||
        week > 15 ||
        team1 < 1 ||
        team1 > 16 ||
        team2 < 1 ||
        team2 > 16
      ) {
        return;
      }

      if (!liveSchedule[week]) {
        liveSchedule[week] = [];
      }

      liveSchedule[week].push([team1, team2]);
    });

    if (Object.keys(liveSchedule).length) {
      schedule = liveSchedule;
    } else {
      console.warn('Raw schedule rows:', scheduleResult.value);
      warnings.push(
        'Schedule feed was reachable but contained no usable matchups.'
      );
    }
  } else {
    console.error('Schedule feed failed:', scheduleResult.reason);
    warnings.push(
      'Schedule could not be loaded; backup schedule is being shown.'
    );
  }

  let scores = {};
  if (scoresResult.status === 'fulfilled') {
    scoresResult.value.forEach((row) => {
      const week = Number(row['Week']);
      const teamId = Number(row['Team ID']);
      const rawScore = row['DK Score'];
      if (!Number.isFinite(week) || !Number.isFinite(teamId) || rawScore === '') return;
      const score = Number(rawScore);
      if (Number.isFinite(score) && score >= 0) scores[`${week}-${teamId}`] = score;
    });
  } else {
    console.error('Scores feed failed:', scoresResult.reason);
    warnings.push('Scores could not be loaded from Google Sheets.');
  }

  league = { teams, schedule, scores, currentWeek: 1 };
  league.currentWeek = inferCurrentWeek();
  render();

  if (warnings.length) {
    const heading = document.querySelector('#featured-title');
    if (heading) {
      heading.insertAdjacentHTML(
        'afterend',
        `<p style="color:#d95f13;font-weight:700">${warnings.join(' ')}</p>`
      );
    }
  }
}

$('#weekSelect').addEventListener('change', (event) => renderWeek(Number(event.target.value)));
$('.nav-toggle').addEventListener('click', () => $('.main-nav').classList.toggle('open'));
document.querySelectorAll('.main-nav a').forEach((link) => link.addEventListener('click', () => $('.main-nav').classList.remove('open')));

loadLeague();
