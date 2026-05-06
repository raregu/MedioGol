import { useEffect, useState } from 'react';
import { Trophy, Award } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { PlayoffMatch, PlayoffRound, Championship } from '../types/database';

interface PlayoffBracketProps {
  championship: Championship;
  onMatchClick?: (match: PlayoffMatch) => void;
}

interface RoundMatches {
  round: PlayoffRound;
  roundName: string;
  matches: PlayoffMatch[];
}

const getRoundDisplayName = (round: PlayoffRound): string => {
  const names: Record<PlayoffRound, string> = {
    round_of_32: 'Dieciseisavos',
    round_of_16: 'Octavos de Final',
    quarterfinals: 'Cuartos de Final',
    semifinals: 'Semifinales',
    final: 'Final',
    third_place: 'Tercer Lugar',
  };
  return names[round];
};

const roundOrder: PlayoffRound[] = [
  'round_of_32',
  'round_of_16',
  'quarterfinals',
  'semifinals',
  'final',
];

export default function PlayoffBracket({ championship, onMatchClick }: PlayoffBracketProps) {
  const [matches, setMatches] = useState<PlayoffMatch[]>([]);
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState<PlayoffMatch | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlayoffMatches();
  }, [championship.id]);

  const loadPlayoffMatches = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('playoff_matches')
        .select(`
          *,
          team1:team1_id(id, name, logo_url),
          team2:team2_id(id, name, logo_url),
          winner:winner_id(id, name, logo_url)
        `)
        .eq('championship_id', championship.id)
        .order('round')
        .order('match_number');

      if (error) throw error;

      const regularMatches = data?.filter(m => m.round !== 'third_place') || [];
      const thirdPlace = data?.find(m => m.round === 'third_place') || null;

      setMatches(regularMatches);
      setThirdPlaceMatch(thirdPlace);
    } catch (error) {
      console.error('Error loading playoff matches:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupMatchesByRound = (): RoundMatches[] => {
    const grouped = new Map<PlayoffRound, PlayoffMatch[]>();

    matches.forEach((match) => {
      if (!grouped.has(match.round)) {
        grouped.set(match.round, []);
      }
      grouped.get(match.round)!.push(match);
    });

    const result: RoundMatches[] = [];
    roundOrder.forEach((round) => {
      if (grouped.has(round)) {
        result.push({
          round,
          roundName: getRoundDisplayName(round),
          matches: grouped.get(round)!.sort((a, b) => a.match_number - b.match_number),
        });
      }
    });

    return result;
  };

  const renderMatch = (match: PlayoffMatch) => {
    const isClickable = !!onMatchClick;
    const hasWinner = match.status === 'finished' && match.winner_id;
    const hasTBD = !match.team1_id || !match.team2_id;

    return (
      <div
        key={match.id}
        onClick={() => isClickable && onMatchClick(match)}
        className={`bg-white border-2 rounded-lg p-3 mb-3 ${
          isClickable ? 'cursor-pointer hover:border-blue-500 hover:shadow-md' : ''
        } ${hasWinner ? 'border-green-200' : hasTBD ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200'}`}
      >
        {hasTBD && onMatchClick && (
          <div className="text-xs text-yellow-700 mb-2 font-semibold text-center bg-yellow-100 -mx-3 -mt-3 px-3 py-2 rounded-t-lg">
            🔔 Haz clic para asignar equipos
          </div>
        )}

        {match.leg && (
          <div className="text-xs text-gray-500 mb-2 font-semibold">
            {match.leg === 'first_leg' ? 'IDA' : 'VUELTA'}
          </div>
        )}

        <div className={`flex items-center justify-between mb-2 ${
          match.winner_id === match.team1_id ? 'bg-green-50 -mx-2 px-2 py-1 rounded' : ''
        }`}>
          <div className="flex items-center gap-2 flex-1">
            {match.team1?.logo_url && (
              <img src={match.team1.logo_url} alt="" className="w-6 h-6 object-contain" />
            )}
            <span className="text-sm font-medium truncate">
              {match.team1?.name || 'TBD'}
            </span>
          </div>
          <span className="text-lg font-bold ml-2">
            {match.team1_id ? match.team1_score : '-'}
          </span>
        </div>

        <div className={`flex items-center justify-between ${
          match.winner_id === match.team2_id ? 'bg-green-50 -mx-2 px-2 py-1 rounded' : ''
        }`}>
          <div className="flex items-center gap-2 flex-1">
            {match.team2?.logo_url && (
              <img src={match.team2.logo_url} alt="" className="w-6 h-6 object-contain" />
            )}
            <span className="text-sm font-medium truncate">
              {match.team2?.name || 'TBD'}
            </span>
          </div>
          <span className="text-lg font-bold ml-2">
            {match.team2_id ? match.team2_score : '-'}
          </span>
        </div>

        {match.leg && match.team1_aggregate_score > 0 && (
          <div className="mt-2 pt-2 border-t text-xs text-gray-600 text-center">
            Agregado: {match.team1_aggregate_score} - {match.team2_aggregate_score}
          </div>
        )}

        {match.match_date && (
          <div className="mt-2 text-xs text-gray-500 text-center">
            {new Date(match.match_date).toLocaleDateString()}
          </div>
        )}

        {hasWinner && (
          <div className="mt-2 pt-2 border-t">
            <div className="flex items-center justify-center gap-1 text-xs text-green-600 font-semibold">
              <Trophy className="w-3 h-3" />
              Ganador: {match.winner?.name}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-500">Cargando bracket de playoffs...</div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No hay partidos de playoff configurados</p>
      </div>
    );
  }

  const roundsData = groupMatchesByRound();

  return (
    <div className="space-y-8">
      <div className="flex gap-8 overflow-x-auto pb-4">
        {roundsData.map((roundData) => (
          <div key={roundData.round} className="flex-shrink-0" style={{ minWidth: '280px' }}>
            <div className="sticky top-0 bg-white z-10 pb-3">
              <h3 className="text-lg font-bold text-center mb-4 text-gray-800">
                {roundData.roundName}
              </h3>
            </div>
            <div>
              {roundData.matches.map((match) => renderMatch(match))}
            </div>
          </div>
        ))}
      </div>

      {championship.champion_team_id && (
        <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 border-2 border-yellow-400 rounded-lg p-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Trophy className="w-8 h-8 text-yellow-600" />
            <h3 className="text-2xl font-bold text-yellow-900">Campeón</h3>
            <Trophy className="w-8 h-8 text-yellow-600" />
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-yellow-900">
              {championship.champion?.name}
            </p>
          </div>
        </div>
      )}

      {thirdPlaceMatch && (
        <div className="border-t pt-6">
          <h3 className="text-lg font-bold text-center mb-4 text-gray-800">
            Partido por el Tercer Lugar
          </h3>
          <div className="max-w-sm mx-auto">
            {renderMatch(thirdPlaceMatch)}
          </div>
        </div>
      )}

      {championship.runner_up_team_id && (
        <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Award className="w-6 h-6 text-gray-600" />
            <h4 className="text-lg font-bold text-gray-800">Subcampeón</h4>
          </div>
          <p className="text-xl font-semibold text-center text-gray-700">
            {championship.runner_up?.name}
          </p>
        </div>
      )}

      {championship.third_place_team_id && (
        <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Award className="w-6 h-6 text-orange-600" />
            <h4 className="text-lg font-bold text-orange-800">Tercer Lugar</h4>
          </div>
          <p className="text-xl font-semibold text-center text-orange-700">
            {championship.third_place?.name}
          </p>
        </div>
      )}
    </div>
  );
}