import { detectProjects, settleProjects, projectDeclarationWindow, createDoublingState, applyDoublingAction, openRuleCall, resolveRuleCall } from "./baloot-tournament-rules.js";
// Server-authoritative Saudi Baloot core rules.
// A hand starts with five cards, an up-card auction, then three more cards.
// Saudi tournament projects are declared and settled by the authoritative engine.
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

export function scoreRound(teamPoints, contract, teamTricks = [0, 0], projectRawPoints = [0, 0], multiplier = 1) {
  const target = contractTargetPoints(contract.type);
  const baseGamePoints = contract.type === "sun" ? 26 : 16;
  const contractScore = Number(teamPoints[contract.team] || 0) + Number(projectRawPoints[contract.team] || 0);
  const defendingTeam = 1 - contract.team;
  const defendingScore = Number(teamPoints[defendingTeam] || 0) + Number(projectRawPoints[defendingTeam] || 0);
  const countingTeam = defendingTeam;
  const countingRawPoints = defendingScore;
  const countingGamePoints = cardPointsToGamePoints(Number(teamPoints[countingTeam] || 0), contract.type);
  const contractGamePoints = baseGamePoints - countingGamePoints;
  const cardGamePoints = [0, 0];
  cardGamePoints[countingTeam] = countingGamePoints;
  cardGamePoints[contract.team] = contractGamePoints;
  const kabootTeam = teamTricks[0] === 8 ? 0 : teamTricks[1] === 8 ? 1 : null;
  const gamePoints = [0, 0];
  let winningTeam;

  if (kabootTeam !== null) {
    winningTeam = kabootTeam;
    gamePoints[kabootTeam] = contract.type === "sun" ? 44 : 25;
  } else if (contractScore > defendingScore) {
    winningTeam = contract.team;
    gamePoints[0] = cardGamePoints[0];
    gamePoints[1] = cardGamePoints[1];
  } else if (contractScore < defendingScore || (contractScore === defendingScore && multiplier > 1)) {
    // In a doubled hand, a raw-point tie is lost by the buyer (the doubled side).
    winningTeam = defendingTeam;
    gamePoints[winningTeam] = baseGamePoints;
  } else {
    // An ordinary tie is made by the buyer.
    winningTeam = contract.team;
    gamePoints[0] = cardGamePoints[0];
    gamePoints[1] = cardGamePoints[1];
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
    projectRawPoints: [...projectRawPoints],
    teamTricks: [...teamTricks],
    gamePoints,
    kaboot: kabootTeam !== null,
    totalGamePoints: gamePoints.reduce((sum, value) => sum + value, 0)
  };
}

export function legalCards(hand, trick, contract, _seat) {
  if (!trick.length) {
    if (contract?.type === "hokom" && contract.locked &&
        hand.some(card => card.suit !== contract.trumpSuit)) {
      return hand.filter(card => card.suit !== contract.trumpSuit);
    }
    return hand;
  }
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
    lastActionAt: new Date().toISOString(),
    projectsBySeat: [null, null, null, null],
    projectsDeclaredBySeat: [false, false, false, false],
    projectCandidatesBySeat: [null, null, null, null],
    declarationsClosed: false,
    projectResult: null,
    pendingRuleCall: null,
    ruleCallHistory: []
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
  next.contract = { ...contract, buyerSeat };
  next.bidRound = 0;
  next.bidPasses = 0;
  next.sunOvercallEligible = [];
  next.projectsBySeat = [null, null, null, null];
  next.projectsDeclaredBySeat = [false, false, false, false];
  next.projectCandidatesBySeat = next.seats.map((player, seat) => detectProjects(player.hand, next.contract, seat));
  next.declarationsClosed = false;
  next.projectResult = null;
  const sunDoubleAllowed = contract.type === "sun" &&
    next.matchPoints[buyerSeat % 2] <= 100 && next.matchPoints[1 - (buyerSeat % 2)] > 100;
  if (contract.type === "hokom" || sunDoubleAllowed) {
    next.doubling = createDoublingState(next.contract, next.matchPoints);
    next.phase = "doubling";
    next.currentSeat = advanceSeat(buyerSeat);
  } else {
    next.doubling = null;
    next.phase = "playing";
    next.currentSeat = advanceSeat(next.dealer);
  }
  next.gahwa = false;
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
  const order = [];
  const first = advanceSeat(state.dealer);
  for (let offset = 0; offset < index; offset++) order.push((first + offset) % 4);
  return order;
}

function laterBidders(state, seat) {
  const index = bidOrderIndex(state, seat);
  const order = [];
  const first = advanceSeat(state.dealer);
  for (let offset = index + 1; offset < 4; offset++) order.push((first + offset) % 4);
  return order;
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

function balootAnnouncementCard(state, seat) {
  if (!state.contract || state.contract.type !== "hokom") return null;
  const candidate = (state.projectCandidatesBySeat?.[seat] || []).find(project => project.type === "baloot");
  if (!candidate || (state.projectsBySeat?.[seat] || []).some(project => project.type === "baloot")) return null;
  const plays = [
    ...(state.tricks || []).flatMap(trick => trick.plays || []),
    ...(state.trick || [])
  ].filter(play => play.seat === seat);
  const kingPlayed = plays.some(play => play.card.suit === state.contract.trumpSuit && play.card.rank === "K");
  const queenPlayed = plays.some(play => play.card.suit === state.contract.trumpSuit && play.card.rank === "Q");
  const hand = state.seats[seat]?.hand || [];
  if (kingPlayed && hand.some(card => card.suit === state.contract.trumpSuit && card.rank === "Q")) return state.contract.trumpSuit + ":Q";
  if (queenPlayed && hand.some(card => card.suit === state.contract.trumpSuit && card.rank === "K")) return state.contract.trumpSuit + ":K";
  return null;
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

  if (action?.type === "call_live_double") {
    if (state.phase !== "playing" || !state.contract) throw new Error("A live double is available only during an active hand.");
    if (state.contract.type !== "hokom" && state.contract.type !== "sun") throw new Error("This contract cannot be doubled.");
    if (teamOf(seat) === state.contract.team) throw new Error("Only the opposing team may double.");
    if (state.doubling && state.doubling.level !== "normal") throw new Error("This hand has already been doubled.");
    const sunAllowed = state.contract.type !== "sun" ||
      (state.matchPoints[state.contract.team] <= 100 && state.matchPoints[1-state.contract.team] > 100);
    if (!sunAllowed) throw new Error("Sun may be doubled only when the buyer team has 100 or fewer and opponents exceed 100.");
    const next = structuredClone(state);
    const doubling = createDoublingState(next.contract, next.matchPoints);
    doubling.nextActor = seat;
    next.doubling = applyDoublingAction(doubling, seat, {type:"double",locked:Boolean(action.locked)});
    next.resumeSeat = state.currentSeat;
    next.phase = "doubling";
    next.currentSeat = next.contract.buyerSeat;
    rememberAction(next, actionId);
    return { state: next, duplicate: false, event: {type:"live_double_called",seat,locked:Boolean(action.locked)} };
  }

  if (action?.type === "call_rule") {
    if (state.phase !== "playing") throw new Error("Table rule calls are available during play only.");
    if (!["akka","sawa","qayd","takyid","takweesh"].includes(action.kind)) throw new Error("Unsupported table rule call.");
    const next = openRuleCall(state, seat, action.kind, {
      id: action.callId || actionId,
      targetSeat: Number.isInteger(action.targetSeat) ? action.targetSeat : null,
      evidence: typeof action.evidence === "string" ? action.evidence.slice(0,300) : null
    });
    next.ruleCallHistory = [...(state.ruleCallHistory || [])];
    rememberAction(next, actionId);
    return { state: next, duplicate: false, event: { type: "rule_call_opened", call: next.pendingRuleCall } };
  }
  if (action?.type === "resolve_rule_call") {
    if (state.hostId && state.hostId !== String(userId)) throw new Error("Only the table host may record the table ruling.");
    const next = resolveRuleCall(state, {
      decision: action.decision,
      note: action.note,
      refereeId: String(userId)
    });
    next.ruleCallHistory = [...(state.ruleCallHistory || []), structuredClone(next.pendingRuleCall)];
    next.pendingRuleCall = null;
    rememberAction(next, actionId);
    return { state: next, duplicate: false, event: { type: "rule_call_resolved", ruling: next.ruleCallHistory[next.ruleCallHistory.length - 1] } };
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

  if (next.phase === "doubling") {
    const buyer = next.buyerSeat;
    const firstOpponent = advanceSeat(buyer);
    const secondOpponent = (buyer + 3) % 4;
    if (action?.type === "pass") {
      if (seat === firstOpponent) {
        next.currentSeat = secondOpponent;
        next.doubling.nextActor = secondOpponent;
        event = { type: "doubling_passed", seat };
      } else if (seat === secondOpponent && next.doubling?.level === "normal") {
        next.doubling.final = true;
        next.doubling.nextActor = null;
        next.phase = "playing";
        next.currentSeat = advanceSeat(next.dealer);
        event = { type: "doubling_declined" };
      } else {
        throw new Error("Only an opposing player may pass on the initial double.");
      }
    } else {
      next.doubling = applyDoublingAction(next.doubling, seat, action);
      event = { type: "doubling_action", level: next.doubling.level, multiplier: next.doubling.multiplier };
      if (next.doubling.final) {
        next.phase = "playing";
        next.contract = { ...next.contract, locked: Boolean(next.doubling.locked) };
        next.gahwa = next.doubling.level === "gahwa";
        next.currentSeat = Number.isInteger(next.resumeSeat) ? next.resumeSeat : advanceSeat(next.dealer);
        delete next.resumeSeat;
        event = { type: "doubling_complete", level: next.doubling.level, multiplier: next.doubling.multiplier, gahwa: next.gahwa };
      } else {
        next.currentSeat = next.doubling.nextActor;
      }
    }
  } else if (next.phase === "bidding") {
    event = applyBid(next, seat, action);
    if (event.type === "redeal") {
      const redealt = dealNextRound(next);
      rememberAction(redealt, actionId);
      return { state: redealt, duplicate: false, event };
    }
  } else if (next.phase === "playing") {
    if (action?.type === "declare_projects") {
      if (!projectDeclarationWindow(next)) throw new Error("The project declaration window is closed.");
      if (next.projectsDeclaredBySeat?.[seat]) throw new Error("You have already declared your projects.");
      const candidates = next.projectCandidatesBySeat?.[seat] || [];
      const projects = candidates.filter(project => project.type !== "baloot");
      const sequenceShowsBaloot = next.contract.type === "hokom" &&
        projects.some(project => project.subtype === "sequence" &&
          project.suit === next.contract.trumpSuit &&
          project.ranks?.includes("K") && project.ranks?.includes("Q"));
      const autoBaloot = sequenceShowsBaloot ? candidates.find(project => project.type === "baloot") : null;
      next.projectsBySeat[seat] = [...(next.projectsBySeat?.[seat] || []), ...projects,
        ...(autoBaloot && !(next.projectsBySeat?.[seat] || []).some(project => project.type === "baloot") ? [autoBaloot] : [])];
      next.projectsDeclaredBySeat[seat] = true;
      event = { type: "projects_declared", seat, projects };
    } else if (action?.type !== "play") throw new Error("Declare projects or play one card.");
    if (action?.type === "play") {
    const hand = next.seats[seat].hand;
    const index = hand.findIndex(card => cardKey(card) === action.card);
    if (index < 0) throw new Error("That card is not in your hand.");
    const card = hand[index];
    if (action.announceBaloot) {
      const expectedBalootCard = balootAnnouncementCard(next, seat);
      if (!expectedBalootCard || expectedBalootCard !== cardKey(card)) {
        throw new Error("Baloot must be announced before playing the second trump King or Queen.");
      }
      next.projectsBySeat[seat] = [...(next.projectsBySeat?.[seat] || []),
        (next.projectCandidatesBySeat?.[seat] || []).find(project => project.type === "baloot")];
    }
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
        next.declarationsClosed = true;
        const multiplier = next.doubling?.multiplier || 1;
        const projectResult = settleProjects((next.projectsBySeat || []).map(value => value || []), next.contract, next.dealer, multiplier);
        const result = scoreRound(next.teamPoints, next.contract, next.teamTricks, projectResult.rawAwarded, multiplier);
        let projectPoints = [...projectResult.awarded];
        if (result.kaboot) {
          projectPoints = [0,0];
          for (const project of projectResult.projects || []) {
            if (teamOf(project.seat) !== result.winningTeam) continue;
            projectPoints[result.winningTeam] += project.type === "baloot"
              ? 2 : project.value * (multiplier === 2 ? 2 : 1);
          }
        } else if (!result.made) {
          projectPoints = [0,0];
          projectPoints[1 - next.contract.team] = projectResult.awarded.reduce((sum,value)=>sum+value,0);
        }
        if (multiplier > 1) {
          const doubledPoints = [0, 0];
          const base = next.contract.type === "sun" ? 26 : 16;
          doubledPoints[result.winningTeam] = result.kaboot
            ? (next.contract.type === "sun" ? 44 : 25)
            : base * multiplier;
          result.gamePoints = doubledPoints;
          result.totalGamePoints = doubledPoints[0] + doubledPoints[1];
          result.doubled = true;
          result.multiplier = multiplier;
        }
        result.projectPoints = [...projectPoints];
        result.projectResult = projectResult;
        result.gamePoints = result.gamePoints.map((points, team) => points + projectPoints[team]);
        next.projectResult = projectResult;
        next.matchPoints = next.matchPoints.map((points, team) => points + result.gamePoints[team]);
        const topScore = Math.max(...next.matchPoints);
        const tiedAtTarget = next.matchPoints[0] === next.matchPoints[1] && topScore >= next.targetScore;
        next.phase = next.gahwa || (topScore >= next.targetScore && !tiedAtTarget) ? "match_complete" : "round_complete";
        if (next.gahwa) next.matchWinnerTeam = result.winningTeam;
        next.roundResult = { ...result, matchPoints: [...next.matchPoints], gahwa: next.gahwa, matchWinnerTeam: next.matchWinnerTeam ?? null };
        event = { type: "round_complete", result: next.roundResult };
      }
    } else {
      next.currentSeat = advanceSeat(seat);
      event = { type: "card_played", seat, card: cardKey(card) };
    }
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
    doubling: state.doubling || null,
    gahwa: Boolean(state.gahwa),
    matchWinnerTeam: state.matchWinnerTeam ?? null,
    trick: state.trick,
    tricks: state.tricks,
    teamPoints: state.teamPoints,
    teamTricks: state.teamTricks,
    round: state.round,
    targetScore: state.targetScore,
    matchPoints: state.matchPoints,
    roundResult: state.roundResult || null,
    projectDeclarations: (state.projectsBySeat || [null,null,null,null]).map((projects, seat) => ({
      seat, declared: Boolean(state.projectsDeclaredBySeat?.[seat]) || (Array.isArray(projects) && projects.some(project => project.type === "baloot")), projects: Array.isArray(projects) && (state.tricks.length > 0 || state.phase === "round_complete" || state.phase === "match_complete") ? projects : undefined
    })),
    projectWindowOpen: projectDeclarationWindow(state),
    myProjectsDeclared: Boolean(state.projectsDeclaredBySeat?.[state.seats.findIndex(player => player.userId === String(viewerId))]),
    balootAnnouncementCard: balootAnnouncementCard(state, state.seats.findIndex(player => player.userId === String(viewerId))),
    canDouble: state.phase === "playing" && Boolean(state.contract) &&
      teamOf(state.seats.findIndex(player => player.userId === String(viewerId))) !== state.contract.team &&
      (!state.doubling || state.doubling.level === "normal") &&
      (state.contract.type !== "sun" || (state.matchPoints[state.contract.team] <= 100 && state.matchPoints[1-state.contract.team] > 100)),
    projectResult: state.projectResult || null,
    pendingRuleCall: state.pendingRuleCall || null,
    ruleCallHistory: state.ruleCallHistory || [],
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
