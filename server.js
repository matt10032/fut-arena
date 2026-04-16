const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Database
const db = new Database(path.join(__dirname, 'fut-arena.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============== DATABASE SETUP ==============
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT UNIQUE NOT NULL,
    email TEXT,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','capitaine','joueur')),
    gamertag TEXT DEFAULT '',
    platform TEXT DEFAULT 'PS5',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tag TEXT NOT NULL,
    platform TEXT DEFAULT 'PS5',
    gamertag TEXT DEFAULT '',
    owner_id INTEGER REFERENCES users(id),
    wins INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS team_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    player_name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    format TEXT NOT NULL,
    team_count INTEGER NOT NULL,
    platform TEXT DEFAULT 'PS5',
    match_type INTEGER DEFAULT 1,
    start_date TEXT,
    prize TEXT DEFAULT '',
    rules TEXT DEFAULT '',
    status TEXT DEFAULT 'open',
    winner_name TEXT,
    winner_id INTEGER,
    total_rounds INTEGER,
    league_config TEXT,
    owner_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id),
    team_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, team_id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    round INTEGER DEFAULT 1,
    matchday INTEGER,
    scheduled_date TEXT,
    t1_id INTEGER,
    t1_name TEXT,
    t2_id INTEGER,
    t2_name TEXT,
    t1_score INTEGER,
    t2_score INTEGER,
    t1_submitted TEXT,
    t2_submitted TEXT,
    final_s1 INTEGER,
    final_s2 INTEGER,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','conflict','validated')),
    forfeit_id INTEGER,
    screenshots TEXT DEFAULT '{}',
    first_submit_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    from_user TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id),
    score INTEGER NOT NULL,
    by_user TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trophies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT NOT NULL,
    trophy_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pseudo, trophy_id)
  );

  CREATE TABLE IF NOT EXISTS feed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS player_clubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    team_id INTEGER REFERENCES teams(id),
    UNIQUE(user_id)
  );
`);

// ============== HELPERS ==============
function hash(pw){ return crypto.createHash('sha256').update(pw).digest('hex'); }

// ============== AUTH ROUTES ==============
app.post('/api/signup', (req, res) => {
  const { pseudo, email, password, role } = req.body;
  if(!pseudo||!password||!role) return res.status(400).json({error:'Champs requis'});
  if(password.length<6) return res.status(400).json({error:'Mot de passe trop court'});
  try {
    const stmt = db.prepare('INSERT INTO users (pseudo, email, password, role) VALUES (?, ?, ?, ?)');
    const result = stmt.run(pseudo, email, hash(password), role);
    res.json({ok:true, user:{id:result.lastInsertRowid, pseudo, role, email}});
  } catch(e) {
    res.status(400).json({error:'Pseudo déjà pris'});
  }
});

app.post('/api/login', (req, res) => {
  const { pseudo, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE pseudo = ? AND password = ?').get(pseudo, hash(password));
  if(!user) return res.status(401).json({error:'Pseudo ou mot de passe incorrect'});
  res.json({ok:true, user:{id:user.id, pseudo:user.pseudo, role:user.role, email:user.email, gamertag:user.gamertag, platform:user.platform}});
});

app.post('/api/user/update', (req, res) => {
  const { userId, gamertag, platform } = req.body;
  db.prepare('UPDATE users SET gamertag=?, platform=? WHERE id=?').run(gamertag||'', platform||'PS5', userId);
  res.json({ok:true});
});

// ============== TEAMS ==============
app.get('/api/teams', (req, res) => {
  const { owner_id } = req.query;
  const teams = owner_id
    ? db.prepare('SELECT * FROM teams WHERE owner_id=?').all(owner_id)
    : db.prepare('SELECT * FROM teams').all();
  teams.forEach(t => {
    t.players = db.prepare('SELECT player_name FROM team_players WHERE team_id=?').all(t.id).map(p=>p.player_name);
    const r = db.prepare('SELECT AVG(score) as avg FROM ratings WHERE team_id=?').get(t.id);
    t.rating = r?.avg ? parseFloat(r.avg).toFixed(1) : null;
  });
  res.json(teams);
});

app.post('/api/teams', (req, res) => {
  const { name, tag, platform, gamertag, players, owner_id } = req.body;
  if(!name||!tag) return res.status(400).json({error:'Nom et tag requis'});
  const r = db.prepare('INSERT INTO teams (name,tag,platform,gamertag,owner_id) VALUES (?,?,?,?,?)').run(name,tag.toUpperCase(),platform||'PS5',gamertag||'',owner_id);
  const tid = r.lastInsertRowid;
  if(players?.length) {
    const ins = db.prepare('INSERT INTO team_players (team_id, player_name) VALUES (?,?)');
    players.forEach(p => ins.run(tid, p));
  }
  res.json({ok:true, id:tid});
});

app.put('/api/teams/:id', (req, res) => {
  const { name, tag, platform, gamertag, players } = req.body;
  db.prepare('UPDATE teams SET name=?,tag=?,platform=?,gamertag=? WHERE id=?').run(name,tag?.toUpperCase(),platform,gamertag||'',req.params.id);
  db.prepare('DELETE FROM team_players WHERE team_id=?').run(req.params.id);
  if(players?.length) {
    const ins = db.prepare('INSERT INTO team_players (team_id, player_name) VALUES (?,?)');
    players.forEach(p => ins.run(req.params.id, p));
  }
  res.json({ok:true});
});

app.delete('/api/teams/:id', (req, res) => {
  db.prepare('DELETE FROM teams WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ============== TOURNAMENTS ==============
app.get('/api/tournaments', (req, res) => {
  const { owner_id, status } = req.query;
  let q = 'SELECT * FROM tournaments';
  const params = [];
  const conditions = [];
  if(owner_id) { conditions.push('owner_id=?'); params.push(owner_id); }
  if(status) { conditions.push('status=?'); params.push(status); }
  if(conditions.length) q += ' WHERE ' + conditions.join(' AND ');
  q += ' ORDER BY created_at DESC';
  const tournaments = db.prepare(q).all(...params);
  tournaments.forEach(t => {
    t.registrations = db.prepare('SELECT * FROM registrations WHERE tournament_id=?').all(t.id);
    t.matches = db.prepare('SELECT * FROM matches WHERE tournament_id=? ORDER BY round, id').all(t.id);
    if(t.league_config) t.league = JSON.parse(t.league_config);
  });
  res.json(tournaments);
});

app.post('/api/tournaments', (req, res) => {
  const { name, format, teamCount, platform, matchType, date, prize, rules, league, owner_id } = req.body;
  if(!name) return res.status(400).json({error:'Nom requis'});
  const r = db.prepare('INSERT INTO tournaments (name,format,team_count,platform,match_type,start_date,prize,rules,league_config,owner_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(name, format, teamCount, platform||'PS5', matchType||1, date||'', prize||'', rules||'', league?JSON.stringify(league):null, owner_id);
  res.json({ok:true, id:r.lastInsertRowid});
});

app.delete('/api/tournaments/:id', (req, res) => {
  db.prepare('DELETE FROM tournaments WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ============== REGISTRATIONS ==============
app.post('/api/registrations', (req, res) => {
  const { tournament_id, team_id, team_name } = req.body;
  try {
    db.prepare('INSERT INTO registrations (tournament_id, team_id, team_name) VALUES (?,?,?)').run(tournament_id, team_id, team_name);
    res.json({ok:true});
  } catch(e) { res.status(400).json({error:'Déjà inscrit'}); }
});

app.put('/api/registrations/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE registrations SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ok:true});
});

// ============== MATCH GENERATION ==============
app.post('/api/tournaments/:id/generate', (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id=?').get(req.params.id);
  if(!t) return res.status(404).json({error:'Tournoi introuvable'});
  const regs = db.prepare("SELECT * FROM registrations WHERE tournament_id=? AND status='accepted'").all(t.id);
  const shuffled = regs.sort(() => Math.random() - 0.5);
  const insMatch = db.prepare('INSERT INTO matches (tournament_id,round,matchday,scheduled_date,t1_id,t1_name,t2_id,t2_name) VALUES (?,?,?,?,?,?,?,?)');

  if(t.format === 'elim') {
    const totalRounds = Math.log2(shuffled.length);
    db.prepare('UPDATE tournaments SET total_rounds=?, status=? WHERE id=?').run(totalRounds, 'running', t.id);
    for(let i=0; i<shuffled.length; i+=2) {
      insMatch.run(t.id, 1, 1, null, shuffled[i].team_id, shuffled[i].team_name, shuffled[i+1].team_id, shuffled[i+1].team_name);
    }
  } else if(t.format === 'poules' || t.format === 'champ') {
    db.prepare('UPDATE tournaments SET status=? WHERE id=?').run('running', t.id);
    for(let i=0; i<shuffled.length; i++) {
      for(let j=i+1; j<shuffled.length; j++) {
        insMatch.run(t.id, 1, 1, null, shuffled[i].team_id, shuffled[i].team_name, shuffled[j].team_id, shuffled[j].team_name);
      }
    }
  } else if(t.format === 'ligue') {
    const league = t.league_config ? JSON.parse(t.league_config) : {};
    db.prepare('UPDATE tournaments SET status=? WHERE id=?').run('running', t.id);
    // Round-robin schedule
    const n = shuffled.length;
    const arr = [...shuffled];
    if(n%2!==0) arr.push({team_id:-1, team_name:'BYE'});
    const total = arr.length;
    const rounds = total - 1;
    const half = total / 2;
    const schedule = [];
    let order = arr.map((_,i) => i);
    for(let r=0; r<rounds; r++) {
      const matches = [];
      for(let i=0; i<half; i++) {
        const a=order[i], b=order[total-1-i];
        if(arr[a].team_id!==-1 && arr[b].team_id!==-1) matches.push({t1:arr[a],t2:arr[b]});
      }
      schedule.push(matches);
      order = [order[0], order[total-1], ...order.slice(1, total-1)];
    }
    // Return leg
    const returnLeg = schedule.map(round => round.map(m => ({t1:m.t2, t2:m.t1})));
    const fullSchedule = schedule.concat(returnLeg);
    // Generate dates
    const dates = generateDates(league.duration||12, league.days||[6,0], league.timeStart||'20:00', fullSchedule.length);
    fullSchedule.forEach((roundMatches, idx) => {
      roundMatches.forEach(pair => {
        insMatch.run(t.id, idx+1, idx+1, dates[idx]||null, pair.t1.team_id, pair.t1.team_name, pair.t2.team_id, pair.t2.team_name);
      });
    });
  }
  res.json({ok:true});
});

function generateDates(weeks, days, startTime, count) {
  const dates = [];
  const start = new Date();
  const [h,m] = startTime.split(':').map(Number);
  start.setHours(h,m,0,0);
  const end = new Date(start); end.setDate(end.getDate() + weeks*7);
  let cursor = new Date(start);
  while(dates.length < count && cursor <= end) {
    if(days.includes(cursor.getDay())) dates.push(cursor.toISOString());
    cursor.setDate(cursor.getDate()+1);
  }
  return dates;
}

// ============== SCORE SUBMISSION ==============
app.post('/api/matches/:id/score', (req, res) => {
  const { team_id, s1, s2 } = req.body;
  const m = db.prepare('SELECT * FROM matches WHERE id=?').get(req.params.id);
  if(!m) return res.status(404).json({error:'Match introuvable'});
  
  const isT1 = m.t1_id === team_id;
  const col = isT1 ? 't1_submitted' : 't2_submitted';
  const sub = JSON.stringify({s1,s2,at:new Date().toISOString()});
  
  db.prepare(`UPDATE matches SET ${col}=? ${m.first_submit_at?'':', first_submit_at=?'} WHERE id=?`)
    .run(sub, ...(m.first_submit_at ? [m.id] : [new Date().toISOString(), m.id]));
  
  // Check other side
  const other = isT1 ? m.t2_submitted : m.t1_submitted;
  if(other) {
    const otherData = JSON.parse(other);
    if(otherData.s1===s1 && otherData.s2===s2) {
      db.prepare('UPDATE matches SET final_s1=?,final_s2=?,status=? WHERE id=?').run(s1,s2,'validated',m.id);
      updateTeamStats(m.t1_id, m.t2_id, s1, s2);
      addFeed(`${m.t1_name} ${s1}-${s2} ${m.t2_name}`, 'result');
      checkAdvance(m.tournament_id);
      return res.json({ok:true, result:'validated'});
    } else {
      db.prepare('UPDATE matches SET status=? WHERE id=?').run('conflict', m.id);
      return res.json({ok:true, result:'conflict'});
    }
  }
  res.json({ok:true, result:'waiting'});
});

// ============== FORFEIT ==============
app.post('/api/matches/:id/forfeit', (req, res) => {
  const { forfeit_team_id } = req.body;
  const m = db.prepare('SELECT * FROM matches WHERE id=?').get(req.params.id);
  if(!m) return res.status(404).json({error:'Match introuvable'});
  const isT1 = forfeit_team_id === m.t1_id;
  const s1 = isT1 ? 0 : 3;
  const s2 = isT1 ? 3 : 0;
  db.prepare('UPDATE matches SET final_s1=?,final_s2=?,status=?,forfeit_id=? WHERE id=?').run(s1,s2,'validated',forfeit_team_id,m.id);
  updateTeamStats(m.t1_id, m.t2_id, s1, s2);
  const loserName = isT1 ? m.t1_name : m.t2_name;
  addFeed(`⏱ Forfait : ${loserName} (${m.t1_name} vs ${m.t2_name})`, 'forfeit');
  checkAdvance(m.tournament_id);
  res.json({ok:true});
});

// ============== CONFLICT RESOLUTION ==============
app.post('/api/matches/:id/resolve', (req, res) => {
  const { winner_side } = req.body; // 't1' or 't2'
  const m = db.prepare('SELECT * FROM matches WHERE id=?').get(req.params.id);
  if(!m) return res.status(404).json({error:'Match introuvable'});
  const chosen = JSON.parse(winner_side === 't1' ? m.t1_submitted : m.t2_submitted);
  db.prepare('UPDATE matches SET final_s1=?,final_s2=?,status=? WHERE id=?').run(chosen.s1,chosen.s2,'validated',m.id);
  updateTeamStats(m.t1_id, m.t2_id, chosen.s1, chosen.s2);
  addFeed(`${m.t1_name} ${chosen.s1}-${chosen.s2} ${m.t2_name}`, 'result');
  checkAdvance(m.tournament_id);
  res.json({ok:true});
});

function updateTeamStats(t1id, t2id, s1, s2) {
  if(s1 > s2) {
    db.prepare('UPDATE teams SET wins=wins+1 WHERE id=?').run(t1id);
    db.prepare('UPDATE teams SET losses=losses+1 WHERE id=?').run(t2id);
  } else if(s1 < s2) {
    db.prepare('UPDATE teams SET losses=losses+1 WHERE id=?').run(t1id);
    db.prepare('UPDATE teams SET wins=wins+1 WHERE id=?').run(t2id);
  } else {
    db.prepare('UPDATE teams SET draws=draws+1 WHERE id=?').run(t1id);
    db.prepare('UPDATE teams SET draws=draws+1 WHERE id=?').run(t2id);
  }
}

function checkAdvance(tid) {
  const t = db.prepare('SELECT * FROM tournaments WHERE id=?').get(tid);
  if(!t || t.format !== 'elim') return;
  const currentRound = db.prepare('SELECT MAX(round) as r FROM matches WHERE tournament_id=?').get(tid).r;
  const roundMatches = db.prepare('SELECT * FROM matches WHERE tournament_id=? AND round=?').all(tid, currentRound);
  if(roundMatches.some(m => m.status !== 'validated')) return;
  if(roundMatches.length === 1) {
    const m = roundMatches[0];
    const wName = m.final_s1 > m.final_s2 ? m.t1_name : m.t2_name;
    const wId = m.final_s1 > m.final_s2 ? m.t1_id : m.t2_id;
    db.prepare('UPDATE tournaments SET status=?,winner_name=?,winner_id=? WHERE id=?').run('finished',wName,wId,tid);
    addFeed(`🏆 ${wName} remporte ${t.name} !`, 'trophy');
    return;
  }
  const existing = db.prepare('SELECT * FROM matches WHERE tournament_id=? AND round=?').all(tid, currentRound+1);
  if(existing.length > 0) return;
  const ins = db.prepare('INSERT INTO matches (tournament_id,round,t1_id,t1_name,t2_id,t2_name) VALUES (?,?,?,?,?,?)');
  for(let i=0; i<roundMatches.length; i+=2) {
    const m1=roundMatches[i], m2=roundMatches[i+1];
    const w1Id=m1.final_s1>m1.final_s2?m1.t1_id:m1.t2_id;
    const w1Name=m1.final_s1>m1.final_s2?m1.t1_name:m1.t2_name;
    const w2Id=m2.final_s1>m2.final_s2?m2.t1_id:m2.t2_id;
    const w2Name=m2.final_s1>m2.final_s2?m2.t1_name:m2.t2_name;
    ins.run(tid, currentRound+1, w1Id, w1Name, w2Id, w2Name);
  }
}

// ============== CHAT ==============
app.get('/api/chat/:matchId', (req, res) => {
  const msgs = db.prepare('SELECT * FROM chat_messages WHERE match_id=? ORDER BY created_at').all(req.params.matchId);
  res.json(msgs);
});

app.post('/api/chat/:matchId', (req, res) => {
  const { from_user, message } = req.body;
  db.prepare('INSERT INTO chat_messages (match_id, from_user, message) VALUES (?,?,?)').run(req.params.matchId, from_user, message);
  res.json({ok:true});
});

// ============== RATINGS ==============
app.post('/api/ratings', (req, res) => {
  const { team_id, score, by_user } = req.body;
  db.prepare('INSERT INTO ratings (team_id, score, by_user) VALUES (?,?,?)').run(team_id, score, by_user);
  res.json({ok:true});
});

// ============== TROPHIES ==============
app.get('/api/trophies/:pseudo', (req, res) => {
  const trophies = db.prepare('SELECT * FROM trophies WHERE pseudo=?').all(req.params.pseudo);
  res.json(trophies);
});

app.post('/api/trophies', (req, res) => {
  const { pseudo, trophy_id, name, icon, description } = req.body;
  try {
    db.prepare('INSERT INTO trophies (pseudo, trophy_id, name, icon, description) VALUES (?,?,?,?,?)').run(pseudo, trophy_id, name, icon, description);
    res.json({ok:true, new:true});
  } catch(e) { res.json({ok:true, new:false}); }
});

// ============== FEED ==============
function addFeed(msg, type) {
  db.prepare('INSERT INTO feed (message, type) VALUES (?,?)').run(msg, type||'info');
  // Keep only last 100
  db.prepare('DELETE FROM feed WHERE id NOT IN (SELECT id FROM feed ORDER BY id DESC LIMIT 100)').run();
}

app.get('/api/feed', (req, res) => {
  const items = db.prepare('SELECT * FROM feed ORDER BY id DESC LIMIT 30').all();
  res.json(items);
});

// ============== PLAYER CLUBS ==============
app.post('/api/player/join-club', (req, res) => {
  const { user_id, team_id } = req.body;
  db.prepare('INSERT OR REPLACE INTO player_clubs (user_id, team_id) VALUES (?,?)').run(user_id, team_id);
  res.json({ok:true});
});

app.post('/api/player/leave-club', (req, res) => {
  const { user_id } = req.body;
  db.prepare('DELETE FROM player_clubs WHERE user_id=?').run(user_id);
  res.json({ok:true});
});

app.get('/api/player/club/:userId', (req, res) => {
  const row = db.prepare('SELECT team_id FROM player_clubs WHERE user_id=?').get(req.params.userId);
  res.json({team_id: row?.team_id || null});
});

// ============== STANDINGS ==============
app.get('/api/standings/:tournamentId', (req, res) => {
  const regs = db.prepare("SELECT * FROM registrations WHERE tournament_id=? AND status='accepted'").all(req.params.tournamentId);
  const matches = db.prepare("SELECT * FROM matches WHERE tournament_id=? AND status='validated'").all(req.params.tournamentId);
  const teams = {};
  regs.forEach(r => { teams[r.team_id] = {id:r.team_id,name:r.team_name,j:0,v:0,n:0,d:0,bp:0,bc:0,pts:0}; });
  matches.forEach(m => {
    const t1=teams[m.t1_id], t2=teams[m.t2_id];
    if(!t1||!t2) return;
    t1.j++; t2.j++;
    t1.bp+=m.final_s1; t1.bc+=m.final_s2; t2.bp+=m.final_s2; t2.bc+=m.final_s1;
    if(m.final_s1>m.final_s2){t1.v++;t1.pts+=3;t2.d++;}
    else if(m.final_s1<m.final_s2){t2.v++;t2.pts+=3;t1.d++;}
    else{t1.n++;t2.n++;t1.pts++;t2.pts++;}
  });
  const sorted = Object.values(teams).sort((a,b)=>b.pts-a.pts||(b.bp-b.bc)-(a.bp-a.bc)||b.bp-a.bp);
  res.json(sorted);
});

// ============== START ==============
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     🏆 FUT ARENA - Serveur lancé !      ║');
  console.log('║                                          ║');
  console.log(`║  👉 Sur ce PC : http://localhost:${PORT}     ║`);
  console.log('║                                          ║');
  console.log('║  📱 Pour tes potes sur le même WiFi :    ║');
  console.log('║     Partage ton IP locale (voir ci-bas)  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  // Show local IP
  const os = require('os');
  const nets = os.networkInterfaces();
  Object.values(nets).flat().filter(n=>n.family==='IPv4'&&!n.internal).forEach(n=>{
    console.log(`  📡 Adresse pour tes potes : http://${n.address}:${PORT}`);
  });
  console.log('');
  console.log('  ⚠️  Garde cette fenêtre ouverte !');
  console.log('');
});
