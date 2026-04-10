// FPL API TypeScript types
// Reference: https://fantasy.premierleague.com/api/

// ─── bootstrap-static ───────────────────────────────────────────────────────

export interface FplBootstrap {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
  element_types: FplElementType[];
  game_settings: FplGameSettings;
  chips: FplChip[];
}

export interface FplChip {
  id: number;
  name: "wildcard" | "bboost" | "3xc" | "freehit";
  start_event: number;
  stop_event: number;
  chip_type: string;
}

export interface FplEvent {
  id: number;
  name: string;
  deadline_time: string;
  deadline_time_epoch: number;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
  is_previous: boolean;
  average_entry_score: number;
  highest_score: number;
  highest_scoring_entry: number | null;
  top_element: number | null;
  top_element_info: { id: number; points: number } | null;
  transfers_made: number;
  chip_plays: { chip_name: string; num_played: number }[];
}

export interface FplTeam {
  id: number;
  name: string;
  short_name: string;
  strength: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
  pulse_id: number;
}

export interface FplElement {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  team_code: number;
  element_type: number; // 1=GK, 2=DEF, 3=MID, 4=FWD
  now_cost: number; // tenths of £
  total_points: number;
  event_points: number;
  points_per_game: string;
  form: string;
  selected_by_percent: string;
  ict_index: string;
  influence: string;
  creativity: string;
  threat: string;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  status: "a" | "d" | "i" | "s" | "u" | "n"; // available, doubtful, injured, suspended, unavailable, not in squad
  news: string;
  news_added: string | null;
  chance_of_playing_this_round: number | null;
  chance_of_playing_next_round: number | null;
  ep_this: string;
  ep_next: string;
  cost_change_start: number;
  cost_change_event: number;
  transfers_in: number;
  transfers_out: number;
  transfers_in_event: number;
  transfers_out_event: number;
  value_form: string;
  value_season: string;
  squad_number: number | null;
}

export interface FplElementType {
  id: number;
  plural_name: string;
  plural_name_short: string;
  singular_name: string;
  singular_name_short: string; // GK, DEF, MID, FWD
}

export interface FplGameSettings {
  league_join_private_max: number;
  league_join_public_max: number;
  league_max_size_public_classic: number;
  squad_squadsize: number;
  squad_teamsize: number;
  squad_squadplay: number;
}

// ─── fixtures ────────────────────────────────────────────────────────────────

export interface FplFixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string | null;
  finished: boolean;
  started: boolean | null;
  team_h_score: number | null;
  team_a_score: number | null;
  stats: FplFixtureStat[];
  code: number;
  minutes: number;
  provisional_start_time: boolean;
  pulse_id: number;
}

export interface FplFixtureStat {
  identifier: string;
  a: { value: number; element: number }[];
  h: { value: number; element: number }[];
}

// ─── entry (manager) ─────────────────────────────────────────────────────────

export interface FplEntry {
  id: number;
  player_first_name: string;
  player_last_name: string;
  player_region_name: string;
  summary_overall_points: number;
  summary_overall_rank: number;
  summary_event_points: number;
  summary_event_rank: number | null;
  name: string; // team name
  started_event: number;
  favourite_team: number | null;
  kit: string | null;
  last_deadline_bank: number;
  last_deadline_value: number;
  last_deadline_total_transfers: number;
  years_active: number;
  leagues: {
    classic: FplLeagueMembership[];
    h2h: FplLeagueMembership[];
    cup: unknown;
  };
}

export interface FplLeagueMembership {
  id: number;
  name: string;
  short_name: string | null;
  entry_rank: number;
  entry_last_rank: number;
}

// ─── entry history ────────────────────────────────────────────────────────────

export interface FplEntryHistory {
  current: FplEntryHistoryEntry[];
  past: FplEntryPastSeason[];
  chips: FplChipPlay[];
}

export interface FplEntryHistoryEntry {
  event: number;
  points: number;
  total_points: number;
  rank: number;
  rank_sort: number;
  overall_rank: number;
  bank: number;
  value: number;
  event_transfers: number;
  event_transfers_cost: number;
  points_on_bench: number;
}

export interface FplEntryPastSeason {
  season_name: string;
  total_points: number;
  rank: number;
}

export interface FplChipPlay {
  name: "bboost" | "3xc" | "wildcard" | "freehit";
  time: string;
  event: number;
}

// ─── entry picks ─────────────────────────────────────────────────────────────

export interface FplEntryPicks {
  active_chip: string | null;
  automatic_subs: FplAutomaticSub[];
  entry_history: FplEntryHistoryEntry;
  picks: FplPick[];
}

export interface FplPick {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface FplAutomaticSub {
  entry: number;
  element_in: number;
  element_out: number;
  event: number;
}

// ─── league standings ─────────────────────────────────────────────────────────

export interface FplLeagueStandings {
  league: FplLeague;
  new_entries: { has_next: boolean; page: number; results: unknown[] };
  standings: {
    has_next: boolean;
    page: number;
    results: FplLeagueStandingEntry[];
  };
}

export interface FplLeague {
  id: number;
  name: string;
  created: string;
  closed: boolean;
  max_entries: number | null;
  league_type: string;
  scoring: string;
  start_event: number;
  code_privacy: string;
  has_cup: boolean;
  cup_league: number | null;
  rank: number | null;
}

export interface FplLeagueStandingEntry {
  id: number;
  event_total: number;
  player_name: string;
  rank: number;
  last_rank: number;
  rank_sort: number;
  total: number;
  entry: number; // manager_id
  entry_name: string; // team name
  has_played: boolean;
}

// ─── element summary (player detail) ──────────────────────────────────────────

export interface FplElementSummary {
  fixtures: FplPlayerFixture[];
  history: FplPlayerHistory[];
  history_past: FplPlayerPastSeason[];
}

export interface FplPlayerFixture {
  id: number;
  code: number;
  team_h: number;
  team_a: number;
  event: number;
  finished: boolean;
  minutes: number;
  provisional_start_time: boolean;
  kickoff_time: string;
  event_name: string;
  is_home: boolean;
  difficulty: number;
}

export interface FplPlayerHistory {
  element: number;
  fixture: number;
  opponent_team: number;
  total_points: number;
  was_home: boolean;
  kickoff_time: string;
  team_h_score: number;
  team_a_score: number;
  round: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  selected: number;
  transfers_balance: number;
  transfers_in: number;
  transfers_out: number;
  value: number;
}

export interface FplPlayerPastSeason {
  season_name: string;
  element_code: number;
  start_cost: number;
  end_cost: number;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
}

// ─── transfers ────────────────────────────────────────────────────────────────

export interface FplTransfer {
  element_in: number;
  element_in_cost: number; // tenths of £
  element_out: number;
  element_out_cost: number; // tenths of £
  entry: number; // manager id
  event: number; // gameweek
  time: string; // ISO timestamp
}

// ─── live event ───────────────────────────────────────────────────────────────

export interface FplLiveEvent {
  elements: FplLiveElement[];
}

export interface FplLiveElement {
  id: number;
  stats: {
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    goals_conceded: number;
    own_goals: number;
    penalties_saved: number;
    penalties_missed: number;
    yellow_cards: number;
    red_cards: number;
    saves: number;
    bonus: number;
    bps: number;
    influence: string;
    creativity: string;
    threat: string;
    ict_index: string;
    total_points: number;
    in_dreamteam: boolean;
  };
  explain: {
    fixture: number;
    stats: { identifier: string; points: number; value: number }[];
  }[];
}
