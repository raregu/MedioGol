import { supabase } from '../lib/supabase';
import type { PlayoffConfig, PlayoffRound, TeamStanding } from '../types/database';

interface BracketTeam {
  seed: number;
  team_id: string;
  team_name: string;
}

interface BracketMatch {
  round: PlayoffRound;
  match_number: number;
  team1_seed?: number;
  team2_seed?: number;
  team1_id?: string;
  team2_id?: string;
}

const getRoundName = (teamsInRound: number): PlayoffRound => {
  switch (teamsInRound) {
    case 32: return 'round_of_32';
    case 16: return 'round_of_16';
    case 8: return 'quarterfinals';
    case 4: return 'semifinals';
    case 2: return 'final';
    default: return 'round_of_16';
  }
};

export const generatePlayoffBracket = (
  qualifiedTeams: BracketTeam[],
  config: PlayoffConfig
): BracketMatch[] => {
  const matches: BracketMatch[] = [];
  const numTeams = qualifiedTeams.length;

  if (numTeams < 2) {
    throw new Error('Se necesitan al menos 2 equipos para generar el bracket');
  }

  const firstRound = getRoundName(numTeams);
  const numMatches = numTeams / 2;

  for (let i = 0; i < numMatches; i++) {
    const highSeed = qualifiedTeams[i];
    const lowSeed = qualifiedTeams[numTeams - 1 - i];

    matches.push({
      round: firstRound,
      match_number: i + 1,
      team1_seed: highSeed.seed,
      team2_seed: lowSeed.seed,
      team1_id: highSeed.team_id,
      team2_id: lowSeed.team_id,
    });
  }

  let currentRoundTeams = numMatches;
  let currentRound = firstRound;

  while (currentRoundTeams > 1) {
    currentRoundTeams = currentRoundTeams / 2;

    if (currentRoundTeams === 1) {
      currentRound = 'final';
    } else if (currentRoundTeams === 2) {
      currentRound = 'semifinals';
    } else if (currentRoundTeams === 4) {
      currentRound = 'quarterfinals';
    } else if (currentRoundTeams === 8) {
      currentRound = 'round_of_16';
    }

    for (let i = 0; i < currentRoundTeams; i++) {
      matches.push({
        round: currentRound,
        match_number: i + 1,
      });
    }
  }

  if (config.include_third_place_match) {
    matches.push({
      round: 'third_place',
      match_number: 1,
    });
  }

  return matches;
};

export const getTopTeamsForPlayoffs = async (
  championshipId: string,
  numTeams: number
): Promise<BracketTeam[]> => {
  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select(`
      id,
      home_team_id,
      away_team_id,
      home_score,
      away_score,
      status
    `)
    .eq('championship_id', championshipId)
    .eq('status', 'finished');

  if (matchesError) {
    console.error('Error fetching matches:', matchesError);
    throw matchesError;
  }

  const { data: teams, error: teamsError } = await supabase
    .from('base_teams')
    .select(`
      id,
      name,
      team_registrations!inner(
        championship_id
      )
    `)
    .eq('team_registrations.championship_id', championshipId);

  if (teamsError) {
    console.error('Error fetching teams:', teamsError);
    throw teamsError;
  }

  const standings: Record<string, {
    team_id: string;
    team_name: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goals_for: number;
    goals_against: number;
    goal_difference: number;
    points: number;
  }> = {};

  teams?.forEach((team: any) => {
    standings[team.id] = {
      team_id: team.id,
      team_name: team.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0,
      points: 0,
    };
  });

  matches?.forEach((match: any) => {
    const homeTeam = standings[match.home_team_id];
    const awayTeam = standings[match.away_team_id];

    if (!homeTeam || !awayTeam) return;

    homeTeam.played++;
    awayTeam.played++;

    homeTeam.goals_for += match.home_score;
    homeTeam.goals_against += match.away_score;
    awayTeam.goals_for += match.away_score;
    awayTeam.goals_against += match.home_score;

    if (match.home_score > match.away_score) {
      homeTeam.won++;
      homeTeam.points += 3;
      awayTeam.lost++;
    } else if (match.home_score < match.away_score) {
      awayTeam.won++;
      awayTeam.points += 3;
      homeTeam.lost++;
    } else {
      homeTeam.drawn++;
      awayTeam.drawn++;
      homeTeam.points += 1;
      awayTeam.points += 1;
    }

    homeTeam.goal_difference = homeTeam.goals_for - homeTeam.goals_against;
    awayTeam.goal_difference = awayTeam.goals_for - awayTeam.goals_against;
  });

  const sortedStandings = Object.values(standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
    if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
    return a.team_name.localeCompare(b.team_name);
  });

  const topTeams = sortedStandings.slice(0, numTeams).map((team, index) => ({
    seed: index + 1,
    team_id: team.team_id,
    team_name: team.team_name,
  }));

  return topTeams;
};

export const createPlayoffMatches = async (
  championshipId: string,
  config: PlayoffConfig
): Promise<void> => {
  const topTeams = await getTopTeamsForPlayoffs(championshipId, config.teams_qualify);

  const bracketMatches = generatePlayoffBracket(topTeams, config);

  const playoffMatches = [];

  for (const match of bracketMatches) {
    if (config.format === 'home_away' && match.round !== 'third_place') {
      playoffMatches.push({
        championship_id: championshipId,
        round: match.round,
        match_number: match.match_number,
        leg: 'first_leg',
        team1_id: match.team1_id || null,
        team2_id: match.team2_id || null,
        team1_score: 0,
        team2_score: 0,
        team1_aggregate_score: 0,
        team2_aggregate_score: 0,
        status: 'scheduled',
      });

      playoffMatches.push({
        championship_id: championshipId,
        round: match.round,
        match_number: match.match_number,
        leg: 'second_leg',
        team1_id: match.team2_id || null,
        team2_id: match.team1_id || null,
        team1_score: 0,
        team2_score: 0,
        team1_aggregate_score: 0,
        team2_aggregate_score: 0,
        status: 'scheduled',
      });
    } else {
      playoffMatches.push({
        championship_id: championshipId,
        round: match.round,
        match_number: match.match_number,
        leg: null,
        team1_id: match.team1_id || null,
        team2_id: match.team2_id || null,
        team1_score: 0,
        team2_score: 0,
        team1_aggregate_score: 0,
        team2_aggregate_score: 0,
        status: 'scheduled',
      });
    }
  }

  const { error } = await supabase
    .from('playoff_matches')
    .insert(playoffMatches);

  if (error) {
    console.error('Error creating playoff matches:', error);
    throw error;
  }

  const { error: updateError } = await supabase
    .from('championships')
    .update({ phase: 'playoffs' })
    .eq('id', championshipId);

  if (updateError) {
    console.error('Error updating championship phase:', updateError);
    throw updateError;
  }
};