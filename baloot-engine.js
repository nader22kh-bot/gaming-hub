// Pure, server-authoritative Baloot card rules. No client-supplied score or winner is trusted.
export const SUITS = ["S", "H", "D", "C"];
export const RANKS = ["7", "8", "9", "J", "Q", "K", "10", "A"];
const SUN_ORDER = ["7", "8", "9", "J", "Q", "K", "10", "A"];
const HOKOM_TRUMP_ORDER = ["7", "8", "Q", "K", "10", "A", "9", "J"];
const SUN_POINTS = { "7": 0, "8": 0, "9": 0, J: 2, Q: 3, K: 4, "10": 10, A: 11 };
const TRUMP_POINTS = { "7": 0, "8": 0, "9": 14, J: 20, Q: 3, K: 4, "10": 10, A: 11 };

export function makeDeck(random = Math.random) {
  const deck = SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
export function cardKey(card) { return card.suit + ":" + card.rank; }
export function rankValue(card, contract, leadSuit) {
  const trump = contract?.type === "hokom" && card.suit === contract.trumpSuit;
  const order = trump ? HOKOM_TRUMP_ORDER : SUN_ORDER;
  return order.indexOf(card.rank);
}
export function cardPoints(card, contract) {
  return (contract?.type === "hokom" && card.suit === contract.trumpSuit ? TRUMP_POINTS : SUN_POINTS)[card.rank];
}
export function contractTargetPoints(contractType) {
  if (contractType === "sun") return 65;
  if (contractType === "hokom") return 81;
  throw new Error("Unknown Baloot contract.");
}
export function scoreRound(teamPoints, contract) {
  const target = contractTargetPoints(contract.type);
  const made = teamPoints[contract.team] > target;
  return { contractTeam: contract.team, contractType: contract.type, contractTarget: target,
    contractScore: teamPoints[contract.team], defendingScore: teamPoints[1-contract.team],
    made, winningTeam: made ? contract.team : 1-contract.team, teamPoints: [...teamPoints] };
}
export function legalCards(hand, trick, contract) {
  if (!trick.length) return hand;
  const lead = trick[0].card.suit;
  const following = hand.filter(c => c.suit === lead);
  if (following.length) return following;
  if (contract?.type === "hokom") {
    const trumps = hand.filter(c => c.suit === contract.trumpSuit);
    if (trumps.length) return trumps;
  }
  return hand;
}
export function winningPlay(trick, contract) {
  if (!trick.length) throw new Error("A trick needs at least one card.");
  const lead = trick[0].card.suit;
  const trumps = contract?.type === "hokom" ? trick.filter(p => p.card.suit === contract.trumpSuit) : [];
  const pool = trumps.length ? trumps : trick.filter(p => p.card.suit === lead);
  return pool.reduce((best, play) =>
    rankValue(play.card, contract, lead) > rankValue(best.card, contract, lead) ? play : best
  );
}
export function dealHands(deck = makeDeck()) {
  if (deck.length !== 32) throw new Error("Baloot requires a 32-card deck.");
  return [0, 1, 2, 3].map(seat => deck.slice(seat * 8, seat * 8 + 8));
}
export function createMatch(players, random = Math.random) {
  if (!Array.isArray(players) || players.length !== 4 || new Set(players.map(p => String(p.userId))).size !== 4) {
    throw new Error("Exactly four different players are required.");
  }
  const deck = makeDeck(random);
  const hands = dealHands(deck);
  const seats = players.map((p, seat) => ({
    userId: String(p.userId), name: p.name || "Player " + (seat + 1), seat, ready: true, hand: hands[seat]
  }));
  return {
    phase: "bidding", seats, dealer: 0, currentSeat: 1, contract: null,
    bidPasses: 0, bidHistory: [], trick: [], tricks: [], teamPoints: [0, 0],
    teamTricks: [0, 0], round: 1, targetScore: 152, matchPoints: [0, 0],
    actionIds: [], lastActionAt: new Date().toISOString()
  };
}
function advanceSeat(seat) { return (seat + 1) % 4; }
function teamOf(seat) { return seat % 2; }
function dealNextRound(state) {
  const next = createMatch(state.seats.map(p => ({ userId: p.userId, name: p.name })));
  next.dealer = advanceSeat(state.dealer);
  next.currentSeat = advanceSeat(next.dealer);
  next.round = state.round + 1;
  next.matchPoints = state.matchPoints;
  return next;
}
export function applyMatchAction(state, userId, action, actionId) {
  if (!actionId || typeof actionId !== "string" || actionId.length > 80) throw new Error("A unique action id is required.");
  if (state.actionIds.includes(actionId)) return { state, duplicate: true, event: null };
  const seat = state.seats.findIndex(p => p.userId === String(userId));
  if (seat < 0) throw new Error("You are not seated at this table.");
  if (seat !== state.currentSeat) throw new Error("It is not your turn.");
  const next = structuredClone(state);
  let event;
  if (next.phase === "bidding") {
    const bid = action?.type;
    if (!["pass", "sun", "hokom"].includes(bid)) throw new Error("Choose Sun, Hokom, or Pass.");
    if (bid === "pass") {
      next.bidPasses++;
      next.bidHistory.push({ seat, bid: "pass" });
      if (!next.contract && next.bidPasses === 4) {
        const redealt = dealNextRound(next);
        redealt.actionIds = [...next.actionIds, actionId].slice(-50);
        return { state: redealt, duplicate: false, event: { type: "redeal" } };
      }
      if (next.contract && next.bidPasses >= 3) {
        next.phase = "playing";
        next.currentSeat = advanceSeat(next.dealer);
        event = { type: "contract_set", contract: next.contract };
      } else next.currentSeat = advanceSeat(seat);
    } else {
      if (next.contract) throw new Error("A contract has already been called; pass to confirm it.");
      next.contract = bid === "sun"
        ? { type: "sun", bidderSeat: seat, team: teamOf(seat), trumpSuit: null }
        : { type: "hokom", bidderSeat: seat, team: teamOf(seat), trumpSuit: action.trumpSuit };
      if (bid === "hokom" && !SUITS.includes(action.trumpSuit)) throw new Error("Choose a valid Hokom trump suit.");
      next.bidPasses = 0;
      next.bidHistory.push({ seat, bid, trumpSuit: action.trumpSuit || null });
      next.currentSeat = advanceSeat(seat);
    }
  } else if (next.phase === "playing") {
    if (action?.type !== "play") throw new Error("Play one card.");
    const hand = next.seats[seat].hand;
    const index = hand.findIndex(c => cardKey(c) === action.card);
    if (index < 0) throw new Error("That card is not in your hand.");
    const card = hand[index];
    const legal = legalCards(hand, next.trick, next.contract);
    if (!legal.some(c => cardKey(c) === cardKey(card))) throw new Error("You must follow suit (or trump when required).");
    hand.splice(index, 1);
    next.trick.push({ seat, card });
    if (next.trick.length === 4) {
      const winner = winningPlay(next.trick, next.contract);
      const trickPoints = next.trick.reduce((sum, p) => sum + cardPoints(p.card, next.contract), 0);
      const trickNo = next.tricks.length + 1;
      const total = trickPoints + (trickNo === 8 ? 10 : 0);
      next.teamPoints[teamOf(winner.seat)] += total;
      next.teamTricks[teamOf(winner.seat)]++;
      next.tricks.push({ plays: next.trick, winnerSeat: winner.seat, points: total });
      next.trick = [];
      next.currentSeat = winner.seat;
      event = { type: "trick_complete", winnerSeat: winner.seat, points: total };
      if (next.tricks.length === 8) {
        const contractTeam = next.contract.team;
        const score = scoreRound(next.teamPoints, next.contract);
        const winningTeam = score.winningTeam;
        next.matchPoints[winningTeam] += 1;
        next.phase = "round_complete";
        next.roundResult = { ...score, teamTricks: [...next.teamTricks] };
        event = { type: "round_complete", result: next.roundResult };
      }
    } else {
      next.currentSeat = advanceSeat(seat);
      event = { type: "card_played", seat, card: cardKey(card) };
    }
  } else {
    throw new Error("This round is complete.");
  }
  next.actionIds = [...next.actionIds, actionId].slice(-50);
  next.lastActionAt = new Date().toISOString();
  return { state: next, duplicate: false, event };
}
export function publicMatchState(state, viewerId) {
  return {
    phase: state.phase, dealer: state.dealer, currentSeat: state.currentSeat,
    contract: state.contract, bidPasses: state.bidPasses, bidHistory: state.bidHistory,
    trick: state.trick, tricks: state.tricks, teamPoints: state.teamPoints,
    teamTricks: state.teamTricks, round: state.round, targetScore: state.targetScore,
    matchPoints: state.matchPoints, roundResult: state.roundResult || null,
    seats: state.seats.map(p => ({
      name: p.name, seat: p.seat, ready: p.ready, isMe: p.userId === String(viewerId),
      cardsCount: p.hand.length, hand: p.userId === String(viewerId) ? p.hand : undefined
    }))
  };
}
