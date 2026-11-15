// Saudi tournament Baloot rule helpers, based on the General Baloot Regulations
// published by the Saudi Entertainment Authority / Saudi Mind Sports Federation.
// These helpers are deliberately pure: the server must call them inside the same
// transaction that persists the match state.
import { SUITS, RANKS, teamOf } from "./baloot-engine.js";

const SEQUENCE = ["A", "K", "Q", "J", "10", "9", "8", "7"];
const KIND_ORDER = ["A", "K", "Q", "J", "10"];
const PROJECT_POINTS = {
  hokom: { sira: 2, fifty: 5, hundred: 10, baloot: 2, fourHundred: 0 },
  sun: { sira: 4, fifty: 10, hundred: 20, baloot: 0, fourHundred: 40 }
};

export function detectProjects(hand, contract, seat = 0) {
  if (!Array.isArray(hand) || hand.length !== 8) throw new Error("Projects require a complete eight-card hand.");
  if (!contract || !["sun", "hokom"].includes(contract.type)) throw new Error("A valid contract is required.");
  const projects = [];
  for (const suit of SUITS) {
    const cards = hand.filter(card => card.suit === suit);
    const indexes = cards.map(card => SEQUENCE.indexOf(card.rank)).filter(index => index >= 0).sort((a,b)=>a-b);
    let run = [];
    for (const index of indexes) {
      if (run.length && index !== run[run.length - 1] + 1) {
        addSequenceProject(projects, run.length, suit, seat, contract.type);
        run = [];
      }
      run.push(index);
    }
    addSequenceProject(projects, run.length, suit, seat, contract.type);
  }

  const counts = new Map();
  for (const card of hand) counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
  for (const rank of KIND_ORDER) {
    if (counts.get(rank) === 4) {
      if (rank === "A" && contract.type === "sun") {
        projects.push({ type: "fourHundred", value: 40, rank, seat, priority: 500 });
      } else {
        projects.push({ type: "hundred", subtype: "kind", value: 10, rank, seat,
          priority: 300 + (KIND_ORDER.length - 1 - KIND_ORDER.indexOf(rank)) });
      }
    }
  }

  if (contract.type === "hokom") {
    const trump = hand.filter(card => card.suit === contract.trumpSuit);
    if (trump.some(card => card.rank === "K") && trump.some(card => card.rank === "Q")) {
      projects.push({ type: "baloot", value: 2, seat, priority: 100 });
    }
  }
  return projects.sort((a,b)=>b.priority-a.priority);
}

function addSequenceProject(out, length, suit, seat, contractType) {
  if (length < 3) return;
  const type = length >= 5 ? "hundred" : length === 4 ? "fifty" : "sira";
  out.push({ type, subtype: "sequence", length, suit, seat,
    value: PROJECT_POINTS[contractType][type],
    priority: type === "hundred" ? 400 : type === "fifty" ? 200 : 150 });
}

export function compareProjects(a, b, dealer) {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aDistance = (a.seat - ((dealer + 1) % 4) + 4) % 4;
  const bDistance = (b.seat - ((dealer + 1) % 4) + 4) % 4;
  if (aDistance !== bDistance) return aDistance - bDistance;
  return 0;
}

export function settleProjects(projectsBySeat, contract, dealer, multiplier = 1) {
  const all = projectsBySeat.flat().filter(Boolean);
  if (!all.length) return { winningTeam: null, awarded: [0,0], winningProject: null };
  const ordered = [...all].sort((a,b)=>compareProjects(a,b,dealer));
  const winner = ordered[0];
  const winningTeam = teamOf(winner.seat);
  const winningTeamProjects = all.filter(project => teamOf(project.seat) === winningTeam);
  // Baloot remains two points even when the hand is doubled. Other projects
  // are doubled only at x2; Three and Four never multiply project points.
  const raw = winningTeamProjects.reduce((sum, project) => sum + project.value, 0);
  const doubledBonus = multiplier === 2
    ? winningTeamProjects.reduce((sum, project) => sum + (project.type === "baloot" ? 0 : project.value), 0)
    : 0;
  const awarded = [0,0];
  awarded[winningTeam] = raw + doubledBonus;
  return { winningTeam, awarded, winningProject: winner, projects: all };
}

export function createDoublingState(contract, matchPoints = [0,0]) {
  if (!contract || !["sun","hokom"].includes(contract.type)) throw new Error("A valid contract is required.");
  return {
    multiplier: 1, level: "normal", locked: false, final: false,
    contractType: contract.type,
    buyerSeat: contract.buyerSeat ?? contract.bidderSeat,
    buyerTeam: contract.team,
    doublerSeat: null,
    nextActor: (Number(contract.buyerSeat ?? contract.bidderSeat) + 1) % 4,
    matchPoints: [...matchPoints]
  };
}

export function applyDoublingAction(state, seat, action) {
  if (state.final) throw new Error("The doubling decision is already final.");
  const buyer = state.buyerSeat;
  const buyerTeam = state.buyerTeam;
  const buyerSide = teamOf(seat) === buyerTeam;
  const kind = action?.type;
  const next = structuredClone(state);

  if (kind === "double") {
    if (next.nextActor !== seat) throw new Error("It is not your doubling turn.");
    if (next.level !== "normal" || buyerSide) throw new Error("Only the opposing team may double first.");
    if (action.locked !== undefined && typeof action.locked !== "boolean") throw new Error("Invalid lock choice.");
    if (next.contractType === "sun" &&
        !(next.matchPoints[buyerTeam] <= 100 && next.matchPoints[1-buyerTeam] > 100)) {
      throw new Error("Sun may be doubled only when the buyer team has 100 or fewer and opponents exceed 100.");
    }
    next.multiplier = 2; next.level = "double"; next.doublerSeat = seat;
    next.locked = Boolean(action.locked); next.nextActor = buyer;
  } else if (kind === "three") {
    if (next.level !== "double" || !buyerSide || seat !== buyer) throw new Error("Only the buyer may answer a double with three.");
    if (next.contractType !== "hokom") throw new Error("Three is available only in Hokom.");
    next.multiplier = 3; next.level = "three"; next.locked = false; next.nextActor = next.doublerSeat;
  } else if (kind === "four") {
    if (next.level !== "three" || buyerSide || seat !== next.doublerSeat) throw new Error("Only the original doubler may answer three with four.");
    if (next.contractType !== "hokom") throw new Error("Four is available only in Hokom.");
    if (action.locked !== undefined && typeof action.locked !== "boolean") throw new Error("Invalid lock choice.");
    next.multiplier = 4; next.level = "four"; next.locked = Boolean(action.locked); next.nextActor = buyer;
  } else if (kind === "gahwa") {
    if (next.level !== "four" || !buyerSide || seat !== buyer) throw new Error("Only the buyer may call Gahwa after four.");
    if (next.contractType !== "hokom") throw new Error("Gahwa is available only in Hokom.");
    next.level = "gahwa"; next.final = true; next.locked = false; next.nextActor = null;
  } else if (kind === "accept") {
    if (next.nextActor !== seat) throw new Error("It is not your doubling turn.");
    next.final = true; next.nextActor = null;
  } else {
    throw new Error("Unknown doubling action.");
  }
  return next;
}

// The published tournament rules identify false Akka/Sawa and unsuccessful Qayd
// as violations, but do not fully formalize an online adjudication algorithm.
// Keep claims pending for server-side evidence or a human table moderator;
// never let a client award points or force a redeal.
export function openRuleCall(state, seat, kind, details = {}) {
  if (!["akka","sawa","qayd","takyid","takweesh"].includes(kind)) throw new Error("Unsupported rule call.");
  if (state.pendingRuleCall) throw new Error("A rule call is already pending.");
  return { ...structuredClone(state), pendingRuleCall: {
    id: details.id || null, kind, callerSeat: seat,
    targetSeat: Number.isInteger(details.targetSeat) ? details.targetSeat : null,
    evidence: details.evidence || null, status: "pending"
  }};
}

export function resolveRuleCall(state, ruling) {
  const call = state.pendingRuleCall;
  if (!call || call.status !== "pending") throw new Error("There is no pending rule call.");
  if (!["upheld","rejected","warning","redeal"].includes(ruling?.decision)) throw new Error("A valid table ruling is required.");
  const next = structuredClone(state);
  next.pendingRuleCall.status = ruling.decision;
  next.pendingRuleCall.ruling = String(ruling.note || "").slice(0,300);
  next.pendingRuleCall.ruledBy = ruling.refereeId || "table-moderator";
  return next;
}

export function projectDeclarationWindow(state) {
  return state.phase === "playing" && state.tricks.length === 0 &&
    state.trick.length < 4 && state.declarationsClosed !== true;
}

export function validateAkkaClaim(card, remainingCardsOfSuit) {
  if (!card || !Array.isArray(remainingCardsOfSuit)) return false;
  const rank = SEQUENCE.indexOf(card.rank);
  if (rank < 0) return false;
  return remainingCardsOfSuit.every(other => other.suit !== card.suit ||
    SEQUENCE.indexOf(other.rank) >= rank);
}
