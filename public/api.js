// ============== API CLIENT ==============
// Communicates with the backend server
const API = {
  async req(path, opts={}){
    const res = await fetch(path, {
      headers: {'Content-Type':'application/json'},
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({error:'Erreur serveur'}));
      throw new Error(err.error||'Erreur');
    }
    return res.json();
  },

  // AUTH
  signup: (data) => API.req('/api/signup', {method:'POST', body:data}),
  login: (data) => API.req('/api/login', {method:'POST', body:data}),
  updateUser: (data) => API.req('/api/user/update', {method:'POST', body:data}),

  // TEAMS
  listTeams: (owner_id) => API.req('/api/teams' + (owner_id?`?owner_id=${owner_id}`:'')),
  createTeam: (data) => API.req('/api/teams', {method:'POST', body:data}),
  updateTeam: (id, data) => API.req(`/api/teams/${id}`, {method:'PUT', body:data}),
  deleteTeam: (id) => API.req(`/api/teams/${id}`, {method:'DELETE'}),

  // TOURNAMENTS
  listTournaments: (params={}) => {
    const qs = new URLSearchParams(params).toString();
    return API.req('/api/tournaments' + (qs?`?${qs}`:''));
  },
  createTournament: (data) => API.req('/api/tournaments', {method:'POST', body:data}),
  deleteTournament: (id) => API.req(`/api/tournaments/${id}`, {method:'DELETE'}),
  generateBracket: (id) => API.req(`/api/tournaments/${id}/generate`, {method:'POST'}),

  // REGISTRATIONS
  requestJoin: (data) => API.req('/api/registrations', {method:'POST', body:data}),
  updateRegistration: (id, status) => API.req(`/api/registrations/${id}`, {method:'PUT', body:{status}}),

  // MATCHES
  submitScore: (matchId, data) => API.req(`/api/matches/${matchId}/score`, {method:'POST', body:data}),
  forfeit: (matchId, forfeit_team_id) => API.req(`/api/matches/${matchId}/forfeit`, {method:'POST', body:{forfeit_team_id}}),
  resolveConflict: (matchId, winner_side) => API.req(`/api/matches/${matchId}/resolve`, {method:'POST', body:{winner_side}}),

  // CHAT
  getChat: (matchId) => API.req(`/api/chat/${matchId}`),
  sendChat: (matchId, data) => API.req(`/api/chat/${matchId}`, {method:'POST', body:data}),

  // RATINGS
  addRating: (data) => API.req('/api/ratings', {method:'POST', body:data}),
  getMyRating: (team_id, by_user) => API.req(`/api/ratings/my?team_id=${team_id}&by_user=${encodeURIComponent(by_user)}`),

  // TROPHIES
  listTrophies: (pseudo) => API.req(`/api/trophies/${encodeURIComponent(pseudo)}`),
  awardTrophy: (data) => API.req('/api/trophies', {method:'POST', body:data}),

  // FEED
  getFeed: () => API.req('/api/feed'),

  // PLAYER CLUB
  joinClub: (data) => API.req('/api/player/join-club', {method:'POST', body:data}),
  leaveClub: (user_id) => API.req('/api/player/leave-club', {method:'POST', body:{user_id}}),
  getMyClub: (userId) => API.req(`/api/player/club/${userId}`),

  // STANDINGS
  getStandings: (tournamentId) => API.req(`/api/standings/${tournamentId}`)
};
