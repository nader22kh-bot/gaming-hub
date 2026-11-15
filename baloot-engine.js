// Server-authoritative Saudi Baloot core rules.
// A hand starts with five cards, an up-card auction, then three more cards.
// Optional house-table modules (projects, doubles/Gahwa, Qayd and Sawa) are
// deliberately not simulated until their tournament rule variants are agreed.
export const SUITS = ["S", "H", "D", "C"];
export const RANKS = ["7", "8", "9", "J", "Q", "K", "10", "A"];
const SUN_ORDER = ["7", "8", "9", "J", "Q", "K", "10", "A"];
const HOKOM_TRUMP_ORDER = ["7", "8", "Q", "K", "10", "A", "9", "J"];
const SUN_POINTS = { "7": 0, "8": 0, "9": 0, J: 2, Q: 3, K: 4, "10": 10, A: 11 };
const TRUMP_POINTS = { "7": 0, "8": 0, "9": 14, J: 20, Q: 3, K: 4, "10": 10, A: 11 };
const advanceSeat = seat => (seat + 1) % 4;
export const teamOf = seat => seat % 2;

export function makeDeck(random = Math.random) {
  const deck = SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function cardKey(card) { return card.suit + ":" + card.rank; }

export function rankValue(card, contract) {
  const order = contract?.type === "hokom" && card.suit === contract.trumpSuit
    ? HOKOM_TRUMP_ORDER : SUN_ORDER;
  return order.indexOf(card.rank);
}

export function cardPoints(card, contract) {
  return (contract?.type === "hokom" && card.suit === contract.trumpSuit
    ? TRUMP_POINTS : SUN_POINTS)[card.rank];
}

export function contractTargetPoints(contractType) {
  if (contractType === "sun") return 65;
  if (contractType === "hokom") return 81;
  throw new Error("Unknown Baloot contract.");
}

function cardPointsToGamePoints(rawPoints, contractType) {
  const remainder = rawPoints % 10;
  if (contractType === "sun") {
    return remainder === 5 ? rawPoints / 5 : Math.round(rawPoints / 10) * 2;
  }
  // Hokum rounds a five down, then divides the counting team's score by ten.
  return Math.floor((rawPoints + 4) / 10);
}

export function scoreRound(teamPoints, contract, teamTricks = [0, 0]) {
  const target = contractTargetPoints(contract.type);
  const baseGamePoints = contract.type === "sun" ? 26 : 16;
  const contractScore = Number(teamPoints[contract.team] || 0);
  const defendingScore = Number(teamPoints[1 - contract.team] || 0);
  const countingTeam = 1 - contract.team;
  const countingRawPoints = defendingScore;
  const countingGamePoints = cardPointsToGamePoints(countingRawPoints, contract.type);
  const contractGamePoints = baseGamePoints - countingGamePoints;
  const cardGamePoints = [0, 0];
  cardGamePoints[countingTeam] = countingGamePoints;
  cardGamePoints[contract.team] = contractGamePoints;
  const remainder = countingRawPoints % 10;
  const kabootTeam = teamTricks[0] === 8 ? 0 : teamTricks[1] === 8 ? 1 : null;
  const gamePoints = [0, 0];
  let winningTeam;

  if (kabootTeam !== null) {
    winningTeam = kabootTeam;
    gamePoints[kabootTeam] = contract.type === "sun" ? 44 : 25;
  } else {
    if (countingGamePoints > contractGamePoints) {
      winningTeam = countingTeam;
    } else if (countingGamePoints < contractGamePoints) {
      winningTeam = contract.team;
    } else {
      const countingTeamWinsTie = contract.type === "hokom"
        ? [2, 3, 4, 5].includes(remainder)
        : [1, 2, 3, 4].includes(remainder);
      winningTeam = countingTeamWinsTie ? countingTeam : contract.team;
    }

    if (winningTeam === contract.team) {
      gamePoints[0] = cardGamePoints[0];
      gamePoints[1] = cardGamePoints[1];
    } else {
      gamePoints[winningTeam] = baseGamePoints;
    }
  }

  return {
    contractTeam: contract.team,
    contractType: contract.type,
    contractTarget: target,
    contractScore,
    defendingScore,
    countingTeam,
    countingRawPoints,
    cardGamePoints,
    made: winningTeam === contract.team,
    winningTeam,
    teamPoints: [...teamPoints],
    teamTricks: [...teamTricks],
    gamePoints,
    kaboot: kabootTeam !== null,
    totalGamePoints: gamePoints.reduce((sum, value) => sum + value, 0)
  };
}

export function legalCards(hand, trick, contract, _seat) {
  if (!trick.length) return hand;
  const leadSuit = trick[0].card.suit;
  const following = hand.filter(card => card.suit === leadSuit);

  if (following.length) {
    if (contract?.type === "hokom" && leadSuit === contract.trumpSuit) {
      const highestTrump = Math.max(...trick
        .filter(play => play.card.suit === contract.trumpSuit)
        .map(play => rankValue(play.card, contract)));
      const overtrumps = following.filter(card => rankValue(card, contract) > highestTrump);
      return overtrumps.length ? overtrumps : following;
    }
    return following;
  }

  if (contract?.type !== "hokom") return hand;
  const trumps = hand.filter(card => card.suit === contract.trumpSuit);
  if (!trumps.length) return hand;
  const tableTrumps = trick.filter(play => play.card.suit === contract.trumpSuit);
  if (tableTrumps.length) {
    const highestTrump = Math.max(...tableTrumps.map(play => rankValue(play.card, contract)));
    const overtrumps = trumps.filter(card => rankValue(card, contract) > highestTrump);
    return overtrumps.length ? overtrumps : trumps;
  }
  return trumps;
}

export function winningPlay(trick, contract) {
  if (!trick.length) throw new Error("A trick needs at least one card.");
  const leadSuit = trick[0].card.suit;
  const trumps = contract?.type === "hokom"
    ? trick.filter(play => play.card.suit === contract.trumpSuit) : [];
  const candidates = trumps.length
    ? trumps : trick.filter(play => play.card.suit === leadSuit);
  return candidates.reduce((best, play) =>
    rankValue(play.card, contract) > rankValue(best.card, contract) ? play : best
  );
}

export function dealHands(deck = makeDeck()) {
  if (deck.length !== 32) throw new Error("Baloot requires a 32-card deck.");
  return [0, 1, 2, 3].map(seat => deck.slice(seat * 8, seat * 8 + 8));
}

function dealFirstFive(deck, dealer) {
  const hands = [[], [], [], []];
  let cursor = 0;
  for (const packetSize of [3, 2]) {
    for (let offset = 1; offset <= 4; offset++) {
      const seat = (dealer + offset) % 4;
      for (let card = 0; card < packetSize; card++) hands[seat].push(deck[cursor++]);
    }
  }
  const faceUp = deck[cursor++];
  return { hands, faceUp, stock: deck.slice(cursor) };
}

export function createMatch(players, random = Math.random, options = {}) {
  if (!Array.isArray(players) || players.length !== 4 ||
      new Set(players.map(player => String(player.userId))).size !== 4) {
    throw new Error("Exactly four different players are required.");
  }
  const dealer = Number.isInteger(options.dealer) ? ((options.dealer % 4) + 4) % 4 : 0;
  const deck = makeDeck(random);
  const initial = dealFirstFive(deck, dealer);
  const seats = players.map((player, seat) => ({
    userId: String(player.userId),
    name: player.name || "Player " + (seat + 1),
    seat,
    ready: true,
    hand: initial.hands[seat]
  }));
  return {
    phase: "bidding",
    seats,
    dealer,
    currentSeat: advanceSeat(dealer),
    bidRound: 1,
    bidPasses: 0,
    sunOvercallEligible: [],
    bidHistory: [],
    faceUp: initial.faceUp,
    stock: initial.stock,
    contract: null,
    buyerSeat: null,
    trick: [],
    tricks: [],
    teamPoints: [0, 0],
    teamTricks: [0, 0],
    round: options.round || 1,
    targetScore: 152,
    matchPoints: options.matchPoints ? [...options.matchPoints] : [0, 0],
    actionIds: [],
    hostId: options.hostId || null,
    lastActionAt: new Date().toISOString()
  };
}

function dealNextRound(state, random = Math.random) {
  const next = createMatch(
    state.seats.map(player => ({ userId: player.userId, name: player.name })),
    random,
    {
      dealer: advanceSeat(state.dealer),
      round: state.round + 1,
      matchPoints: state.matchPoints,
      hostId: state.hostId
    }
  );
  next.actionIds = [...(state.actionIds || [])];
  return next;
}

function completeAuction(state) {
  if (!state.contract) throw new Error("There is no contract to complete.");
  const next = state;
  const contract = next.contract;
  const buyerSeat = contract.ashkal ? (contract.bidderSeat + 2) % 4 : contract.bidderSeat;
  const stock = [...next.stock];
  for (let offset = 1; offset <= 4; offset++) {
    const seat = (next.dealer + offset) % 4;
    const extra = seat === buyerSeat ? 2 : 3;
    const cards = stock.splice(0, extra);
    if (seat === buyerSeat) next.seats[seat].hand.push(contract.ashkal ? next.faceUp : next.faceUp, ...cards);
    else next.seats[seat].hand.push(...cards);
  }
  if (stock.length !== 0 || next.seats.some(player => player.hand.length !== 8)) {
    throw new Error("The Baloot deal could not be completed.");
  }
  next.stock = [];
  next.faceUp = null;
  next.buyerSeat = buyerSeat;
  next.bidRound = 0;
  next.bidPasses = 0;
  next.sunOvercallEligible = [];
  next.phase = "playing";
  next.currentSeat = advanceSeat(next.dealer);
  return next;
}

function rememberAction(state, actionId) {
  state.actionIds = [...(state.actionIds || []), actionId].slice(-100);
  state.lastActionAt = new Date().toISOString();
}

function bidOrderIndex(state, seat) {
  return (seat - advanceSeat(state.dealer) + 4) % 4;
}

function earlierBidders(state, seat) {
  const index = bidOrderIndex(state, seat);
  return [0, 1, 2, 3].filter(candidate => bidOrderIndex(state, candidate) < index);
}

function laterBidders(state, seat) {
  const index = bidOrderIndex(state, seat);
  return [0, 1, 2, 3].filter(candidate => bidOrderIndex(state, candidate) > index);
}

function applyBid(next, seat, action) {
  const bid = action?.type;
  if (!["pass", "sun", "hokom", "ashkal"].includes(bid)) {
    throw new Error("Choose Sun, Hokom, or Pass.");
  }

  if (bid === "pass") {
    next.bidPasses++;
    next.bidHistory.push({ seat, bid: "pass", bidRound: next.bidRound });

    if (next.contract?.type === "sun" && next.bidRound === 1) {
      next.sunOvercallEligible = (next.sunOvercallEligible || []).filter(value => value !== seat);
      if (next.sunOvercallEligible.length === 0) {
        completeAuction(next);
        return { type: "contract_set", contract: next.contract };
      }
    } else if (next.contract?.type === "hokom" && next.bidRound === 2) {
      next.sunOvercallEligible = (next.sunOvercallEligible || []).filter(value => value !== seat);
      if (next.sunOvercallEligible.length === 0) {
        completeAuction(next);
        return { type: "contract_set", contract: next.contract };
      }
    } else if (next.contract && next.bidPasses >= 3) {
      completeAuction(next);
      return { type: "contract_set", contract: next.contract };
    }

    if (!next.contract && next.bidPasses >= 4) {
      if (next.bidRound === 1) {
        next.bidRound = 2;
        next.bidPasses = 0;
        next.sunOvercallEligible = [];
        next.currentSeat = advanceSeat(next.dealer);
        return { type: "second_bidding_round" };
      }
      return { type: "redeal" };
    }

    next.currentSeat = advanceSeat(seat);
    return { type: "bid_passed", seat };
  }

  let contract;

  if (bid === "sun") {
    if (next.contract?.type === "hokom") {
      if (next.bidRound === 2 && !(next.sunOvercallEligible || []).includes(seat)) {
        throw new Error("Only a player who has not spoken in the second round may overcall with Sun.");
      }
    } else if (next.contract?.type === "sun") {
      if (next.bidRound !== 1 || !(next.sunOvercallEligible || []).includes(seat)) {
        throw new Error("Only a player who spoke earlier in the first round may take Sun.");
      }
    } else if (next.contract) {
      throw new Error("This contract cannot be overcalled.");
    }

    contract = { type: "sun", bidderSeat: seat, team: teamOf(seat), trumpSuit: null, ashkal: false };
    next.contract = contract;
    next.sunOvercallEligible = earlierBidders(next, seat);
  } else if (bid === "ashkal") {
    const ashkalSeat = seat === next.dealer || seat === (next.dealer + 3) % 4;
    if (next.bidRound !== 1 || next.contract || !ashkalSeat || next.faceUp?.rank === "A") {
      throw new Error("Ashkal is not available from this seat or on this up-card.");
    }
    contract = { type: "sun", bidderSeat: seat, team: teamOf(seat), trumpSuit: null, ashkal: true };
    next.contract = contract;
    next.sunOvercallEligible = earlierBidders(next, seat);
  } else {
    if (next.contract) throw new Error("A Hokom contract has already been called.");
    const suit = action.trumpSuit || (next.bidRound === 1 ? next.faceUp?.suit : null);
    if (!SUITS.includes(suit)) throw new Error("Choose a valid Hokom trump suit.");
    if (next.bidRound === 1 && suit !== next.faceUp.suit) {
      throw new Error("First-round Hokom must use the face-up card's suit.");
    }
    if (next.bidRound === 2 && suit === next.faceUp.suit) {
      throw new Error("Second-round Hokom must choose a different suit.");
    }
    contract = { type: "hokom", bidderSeat: seat, team: teamOf(seat), trumpSuit: suit, ashkal: false };
    next.contract = contract;
    next.sunOvercallEligible = next.bidRound === 2 ? laterBidders(next, seat) : [];
  }

  next.bidPasses = 0;
  next.bidHistory.push({
    seat,
    bid,
    bidRound: next.bidRound,
    trumpSuit: contract.trumpSuit,
    buyerSeat: contract.ashkal ? (seat + 2) % 4 : seat
  });

  if (bid === "sun" && next.bidRound === 2) {
    completeAuction(next);
    return { type: "contract_set", contract: next.contract };
  }
  if ((bid === "sun" || bid === "ashkal") && next.sunOvercallEligible.length === 0) {
    completeAuction(next);
    return { type: "contract_set", contract: next.contract };
  }
  if (bid === "hokom" && next.bidRound === 2 && next.sunOvercallEligible.length === 0) {
    completeAuction(next);
    return { type: "contract_set", contract: next.contract };
  }

  next.currentSeat = advanceSeat(seat);
  return { type: "bid_called", contract };
}

export function applyMatchAction(state, userId, action, actionId) {
  if (!actionId || typeof actionId !== "string" || actionId.length > 80) {
    throw new Error("A unique action id is required.");
  }
  const seat = state.seats.findIndex(player => player.userId === String(userId));
  if (seat < 0) throw new Error("You are not seated at this table.");
  if ((state.actionIds || []).includes(actionId)) {
    return { state, duplicate: true, event: null };
  }

  if (action?.type === "next_round") {
    if (state.phase !== "round_complete") throw new Error("The round is not ready for a new deal.");
    if (state.hostId && state.hostId !== String(userId)) throw new Error("Only the table host can start the next deal.");
    const next = dealNextRound(state);
    rememberAction(next, actionId);
    return { state: next, duplicate: false, event: { type: "next_round" } };
  }

  if (seat !== state.currentSeat) throw new Error("It is not your turn.");
  const next = structuredClone(state);
  let event;

  if (next.phase === "bidding") {
    event = applyBid(next, seat, action);
    if (event.type === "redeal") {
      const redealt = dealNextRound(next);
      rememberAction(redealt, actionId);
      return { state: redealt, duplicate: false, event };
    }
  } else if (next.phase === "playing") {
    if (action?.type !== "play") throw new Error("Play one card.");
    const hand = next.seats[seat].hand;
    const index = hand.findIndex(card => cardKey(card) === action.card);
    if (index < 0) throw new Error("That card is not in your hand.");
    const card = hand[index];
    const legal = legalCards(hand, next.trick, next.contract, seat);
    if (!legal.some(candidate => cardKey(candidate) === cardKey(card))) {
      throw new Error(next.contract.type === "hokom"
        ? "You must follow suit, trump an opponent, or overtrump when required."
        : "You must follow the led suit when possible.");
    }
    hand.splice(index, 1);
    next.trick.push({ seat, card });
    if (next.trick.length === 4) {
      const winner = winningPlay(next.trick, next.contract);
      const trickPoints = next.trick.reduce((sum, play) => sum + cardPoints(play.card, next.contract), 0);
      const trickNo = next.tricks.length + 1;
      const total = trickPoints + (trickNo === 8 ? 10 : 0);
      next.teamPoints[teamOf(winner.seat)] += total;
      next.teamTricks[teamOf(winner.seat)]++;
      next.tricks.push({ plays: next.trick, winnerSeat: winner.seat, points: total });
      next.trick = [];
      next.currentSeat = winner.seat;
      event = { type: "trick_complete", winnerSeat: winner.seat, points: total };
      if (next.tricks.length === 8) {
        const result = scoreRound(next.teamPoints, next.contract, next.teamTricks);
        next.matchPoints = next.matchPoints.map((points, team) => points + result.gamePoints[team]);
        const topScore = Math.max(...next.matchPoints);
        const tiedAtTarget = next.matchPoints[0] === next.matchPoints[1] && topScore >= next.targetScore;
        next.phase = topScore >= next.targetScore && !tiedAtTarget ? "match_complete" : "round_complete";
        next.roundResult = { ...result, matchPoints: [...next.matchPoints] };
        event = { type: "round_complete", result: next.roundResult };
      }
    } else {
      next.currentSeat = advanceSeat(seat);
      event = { type: "card_played", seat, card: cardKey(card) };
    }
  } else {
    throw new Error("This round is complete.");
  }

  rememberAction(next, actionId);
  return { state: next, duplicate: false, event };
}

export function publicMatchState(state, viewerId) {
  return {
    phase: state.phase,
    dealer: state.dealer,
    currentSeat: state.currentSeat,
    bidRound: state.bidRound,
    bidPasses: state.bidPasses,
    bidHistory: state.bidHistory,
    faceUp: state.faceUp || null,
    contract: state.contract,
    buyerSeat: state.buyerSeat,
    trick: state.trick,
    tricks: state.tricks,
    teamPoints: state.teamPoints,
    teamTricks: state.teamTricks,
    round: state.round,
    targetScore: state.targetScore,
    matchPoints: state.matchPoints,
    roundResult: state.roundResult || null,
    seats: state.seats.map(player => ({
      name: player.name,
      seat: player.seat,
      team: teamOf(player.seat),
      ready: player.ready,
      isMe: player.userId === String(viewerId),
      cardsCount: player.hand.length,
      hand: player.userId === String(viewerId) ? player.hand : undefined
    }))
  };
}

export function chooseAiBid(hand, state, seat) {
  const sunStrength = hand.reduce((sum, card) => sum + SUN_POINTS[card.rank], 0) +
    hand.filter(card => card.rank === "A").length * 2;
  const suitStrength = SUITS.map(suit => {
    const cards = hand.filter(card => card.suit === suit);
    const trumpPower = cards.reduce((sum, card) => sum + ({
      J: 8, "9": 6, A: 4, "10": 3, K: 2, Q: 1, "8": 0, "7": 0
    }[card.rank]), 0);
    return { suit, cards, score: trumpPower + Math.max(0, cards.length - 2) * 2 };
  }).sort((a, b) => b.score - a.score);
  if (state.contract) {
    if (state.contract.type === "hokom" && state.bidRound === 1 && sunStrength >= 48) return { type: "sun" };
    return { type: "pass" };
  }
  if (state.bidRound === 1) {
    const faceSuit = suitStrength.find(item => item.suit === state.faceUp?.suit);
    if (faceSuit && faceSuit.cards.length >= 2 && faceSuit.score >= 7) {
      return { type: "hokom", trumpSuit: state.faceUp.suit };
    }
    if (sunStrength >= 48) return { type: "sun" };
    return { type: "pass" };
  }
  const bestOtherSuit = suitStrength.find(item => item.suit !== state.faceUp?.suit);
  if (bestOtherSuit && bestOtherSuit.cards.length >= 3 && bestOtherSuit.score >= 10) {
    return { type: "hokom", trumpSuit: bestOtherSuit.suit };
  }
  return sunStrength >= 48 ? { type: "sun" } : { type: "pass" };
}

export function chooseAiCard(hand, trick, contract, seat) {
  const legal = legalCards(hand, trick, contract, seat);
  if (legal.length === 1) return legal[0];
  if (!trick.length) {
    return [...legal].sort((a, b) =>
      cardPoints(a, contract) - cardPoints(b, contract) ||
      rankValue(a, contract) - rankValue(b, contract)
    )[0];
  }
  const currentWinner = winningPlay(trick, contract);
  const partnerWinning = teamOf(currentWinner.seat) === teamOf(seat);
  const ranked = legal.map(card => {
    const winner = winningPlay([...trick, { seat, card }], contract);
    return {
      card,
      wins: winner.seat === seat,
      points: cardPoints(card, contract),
      rank: rankValue(card, contract)
    };
  });
  if (partnerWinning) {
    return ranked.sort((a, b) => a.points - b.points || a.rank - b.rank)[0].card;
  }
  const winningCards = ranked.filter(item => item.wins).sort((a, b) =>
    a.points - b.points || a.rank - b.rank
  );
  if (winningCards.length) return winningCards[0].card;
  return ranked.sort((a, b) => a.points - b.points || a.rank - b.rank)[0].card;
}

export function startNextRound(state) {
  if (state.phase !== "round_complete") throw new Error("The round is not ready for a new deal.");
  if (Math.max(...state.matchPoints) >= state.targetScore && state.matchPoints[0] !== state.matchPoints[1]) {
    throw new Error("The match is already complete.");
  }
  return dealNextRound(state);
}
