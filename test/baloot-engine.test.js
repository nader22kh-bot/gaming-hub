import test from "node:test";
import assert from "node:assert/strict";
import {
  makeDeck, dealHands, legalCards, winningPlay, cardPoints,
  contractTargetPoints, scoreRound, createMatch, applyMatchAction,
  publicMatchState, cardKey, startNextRound
} from "../baloot-engine.js";
import { detectProjects } from "../baloot-tournament-rules.js";

const players = () => [1, 2, 3, 4].map(userId => ({ userId, name: "P" + userId }));
const act = (state, seat, action, id = crypto.randomUUID()) =>
  applyMatchAction(state, state.seats[seat].userId, action, id);

test("32-card deck is unique and full deal gives eight cards each", () => {
  const deck = makeDeck(() => 0.5);
  assert.equal(deck.length, 32);
  assert.equal(new Set(deck.map(cardKey)).size, 32);
  assert.deepEqual(dealHands(deck).map(hand => hand.length), [8, 8, 8, 8]);
});

test("new hand deals five cards, exposes one up-card and keeps eleven cards for the buyer deal", () => {
  const match = createMatch(players(), () => 0.4);
  assert.equal(match.phase, "bidding");
  assert.deepEqual(match.seats.map(player => player.hand.length), [5, 5, 5, 5]);
  assert.ok(match.faceUp);
  assert.equal(match.stock.length, 11);
  const all = [...match.seats.flatMap(player => player.hand), match.faceUp, ...match.stock];
  assert.equal(new Set(all.map(cardKey)).size, 32);
  assert.equal(match.currentSeat, 1);
});

test("players must be four distinct Telegram users", () => {
  assert.throws(() => createMatch([{userId:1},{userId:2},{userId:3},{userId:3}]));
});

test("first-round Hokom is tied to the up-card suit and Sun may overcall it", () => {
  let match = createMatch(players(), () => 0.4);
  const upSuit = match.faceUp.suit;
  assert.throws(() => act(match, 1, {type:"hokom", trumpSuit:"S" === upSuit ? "H" : "S"}), /face-up/);
  match = act(match, 1, {type:"hokom", trumpSuit:upSuit}, "hokom-1").state;
  assert.equal(match.contract.type, "hokom");
  match = act(match, 2, {type:"sun"}, "sun-overcall").state;
  assert.equal(match.contract.type, "sun");
  assert.equal(match.contract.bidderSeat, 2);
  match = act(match, 3, {type:"pass"}, "pass-3").state;
  match = act(match, 0, {type:"pass"}, "pass-0").state;
  match = act(match, 1, {type:"pass"}, "pass-1").state;
  assert.equal(match.phase, "playing");
  assert.equal(match.buyerSeat, 2);
  assert.deepEqual(match.seats.map(player => player.hand.length), [8, 8, 8, 8]);
  assert.equal(match.stock.length, 0);
  const all = match.seats.flatMap(player => player.hand);
  assert.equal(new Set(all.map(cardKey)).size, 32);
});

test("a first-round Sun by the first bidder completes immediately", () => {
  const match = act(createMatch(players(), () => 0.4), 1, {type:"sun"}, "sun-first").state;
  assert.equal(match.phase, "playing");
  assert.equal(match.contract.bidderSeat, 1);
});

test("a player who passed earlier may take Sun from a later first-round bidder", () => {
  let match = createMatch(players(), () => 0.4);
  match = act(match, 1, {type:"pass"}, "prior-pass").state;
  match = act(match, 2, {type:"sun"}, "later-sun").state;
  assert.deepEqual(match.sunOvercallEligible,[1]);
  match = act(match, 3, {type:"pass"}, "later-pass-3").state;
  match = act(match, 0, {type:"pass"}, "later-pass-0").state;
  match = act(match, 1, {type:"sun"}, "earlier-sun").state;
  assert.equal(match.phase,"playing");
  assert.equal(match.contract.bidderSeat,1);
});

test("second-round Sun ends the auction immediately", () => {
  let match = createMatch(players(), () => 0.4);
  for (let i=0;i<4;i++) match = act(match,match.currentSeat,{type:"pass"},"sun-second-pass-"+i).state;
  match = act(match,1,{type:"sun"},"sun-second").state;
  assert.equal(match.phase,"playing");
  assert.equal(match.contract.type,"sun");
});

test("a later second-round player may overcall Hokom with Sun", () => {
  let match = createMatch(players(), () => 0.4);
  for (let i=0;i<4;i++) match = act(match,match.currentSeat,{type:"pass"},"hokom-second-pass-"+i).state;
  const otherSuit = ["S","H","D","C"].find(suit=>suit!==match.faceUp.suit);
  match = act(match,1,{type:"hokom",trumpSuit:otherSuit},"second-hokom-overcall").state;
  assert.deepEqual(match.sunOvercallEligible,[2,3,0]);
  match = act(match,2,{type:"sun"},"second-round-sun-overcall").state;
  assert.equal(match.phase,"playing");
  assert.equal(match.contract.type,"sun");
  assert.equal(match.contract.bidderSeat,2);
});

test("four passes open the second auction round; second-round Hokom uses another suit", () => {
  let match = createMatch(players(), () => 0.35);
  for (let seat = 1; seat <= 4; seat++) {
    const current = match.currentSeat;
    match = act(match, current, {type:"pass"}, "first-pass-" + seat).state;
  }
  assert.equal(match.bidRound, 2);
  assert.equal(match.currentSeat, 1);
  assert.throws(() => act(match, 1, {type:"hokom", trumpSuit:match.faceUp.suit}), /different suit/);
  const otherSuit = ["S","H","D","C"].find(suit => suit !== match.faceUp.suit);
  match = act(match, 1, {type:"hokom", trumpSuit:otherSuit}, "second-hokom").state;
  match = act(match, 2, {type:"pass"}, "second-pass-2").state;
  match = act(match, 3, {type:"pass"}, "second-pass-3").state;
  match = act(match, 0, {type:"pass"}, "second-pass-0").state;
  assert.equal(match.phase, "doubling");
  match = act(match, 2, {type:"pass"}, "hokom-double-pass-1").state;
  match = act(match, 0, {type:"pass"}, "hokom-double-pass-2").state;
  assert.equal(match.phase, "playing");
  assert.equal(match.contract.trumpSuit, otherSuit);
  assert.deepEqual(match.seats.map(player => player.hand.length), [8, 8, 8, 8]);
});

test("all passes in both auction rounds redeal and rotate the dealer", () => {
  let match = createMatch(players(), () => 0.4);
  for (let i = 0; i < 8; i++) {
    const seat = match.currentSeat;
    match = act(match, seat, {type:"pass"}, "all-pass-" + i).state;
  }
  assert.equal(match.phase, "bidding");
  assert.equal(match.dealer, 1);
  assert.equal(match.currentSeat, 2);
  assert.equal(match.round, 2);
  assert.deepEqual(match.seats.map(player => player.hand.length), [5, 5, 5, 5]);
});

test("Ashkal is available only to the dealer or player immediately before the dealer", () => {
  let match = createMatch(players(), () => 0.4);
  match = act(match, 1, {type:"pass"}, "ash-pass-1").state;
  match = act(match, 2, {type:"pass"}, "ash-pass-2").state;
  match = act(match, 3, {type:"pass"}, "ash-pass-3").state;
  assert.equal(match.currentSeat, 0);
  match = act(match, 0, {type:"ashkal"}, "ashkal-dealer").state;
  assert.equal(match.contract.type, "sun");
  assert.equal(match.contract.ashkal, true);
  assert.equal(match.contract.bidderSeat, 0);
  match = act(match, 1, {type:"pass"}, "ash-pass-a").state;
  match = act(match, 2, {type:"pass"}, "ash-pass-b").state;
  match = act(match, 3, {type:"pass"}, "ash-pass-c").state;
  assert.equal(match.phase, "playing");
  assert.equal(match.buyerSeat, 2);
});

test("must follow lead suit when possible", () => {
  const hand = [{suit:"H",rank:"7"},{suit:"S",rank:"A"}];
  assert.deepEqual(legalCards(hand,[{seat:0,card:{suit:"H",rank:"8"}}],{type:"sun"}),[hand[0]]);
});

test("Hokom requires a trump when void and an opponent currently wins", () => {
  const hand = [{suit:"S",rank:"7"},{suit:"D",rank:"J"}];
  const trick = [
    {seat:0,card:{suit:"H",rank:"A"}},
    {seat:1,card:{suit:"H",rank:"K"}},
    {seat:2,card:{suit:"H",rank:"Q"}}
  ];
  assert.deepEqual(legalCards(hand,trick,{type:"hokom",trumpSuit:"S"},3),[hand[0]]);
});

test("Hokom requires an overtrump when an opponent trump is winning and a higher trump is held", () => {
  const hand = [{suit:"S",rank:"J"},{suit:"S",rank:"9"},{suit:"D",rank:"7"}];
  const trick = [
    {seat:0,card:{suit:"H",rank:"A"}},
    {seat:1,card:{suit:"H",rank:"K"}},
    {seat:2,card:{suit:"S",rank:"7"}}
  ];
  assert.deepEqual(legalCards(hand,trick,{type:"hokom",trumpSuit:"S"},3),hand.slice(0,2));
});

test("KSA tournament Hokom requires a trump even when the partner is winning", () => {
  const hand = [{suit:"S",rank:"7"},{suit:"D",rank:"J"}];
  const trick = [
    {seat:0,card:{suit:"H",rank:"K"}},
    {seat:1,card:{suit:"H",rank:"A"}},
    {seat:2,card:{suit:"H",rank:"Q"}}
  ];
  assert.deepEqual(legalCards(hand,trick,{type:"hokom",trumpSuit:"S"},3),[hand[0]]);
});

test("a trump lead requires the highest available trump when possible", () => {
  const hand = [{suit:"S",rank:"J"},{suit:"S",rank:"A"},{suit:"D",rank:"7"}];
  const trick = [{seat:0,card:{suit:"S",rank:"9"}},{seat:1,card:{suit:"S",rank:"7"}}];
  assert.deepEqual(legalCards(hand,trick,{type:"hokom",trumpSuit:"S"},2),[hand[0]]);
});

test("Hokom Jack and Nine carry 20 and 14 raw points", () => {
  const contract = {type:"hokom",trumpSuit:"S"};
  assert.equal(cardPoints({suit:"S",rank:"J"},contract),20);
  assert.equal(cardPoints({suit:"S",rank:"9"},contract),14);
});

test("trump beats a lead-suit ace in Hokom", () => {
  const contract={type:"hokom",trumpSuit:"S"};
  const trick=[
    {seat:0,card:{suit:"H",rank:"A"}},
    {seat:1,card:{suit:"S",rank:"7"}},
    {seat:2,card:{suit:"H",rank:"K"}},
    {seat:3,card:{suit:"H",rank:"Q"}}
  ];
  assert.equal(winningPlay(trick,contract).seat,1);
});

test("turn validation rejects a player who is not up", () => {
  const match=createMatch(players(),()=>0.4);
  assert.throws(()=>applyMatchAction(match,"4",{type:"pass"},"wrong-turn"),/not your turn/);
});

test("duplicate action ids do not apply twice", () => {
  const match=createMatch(players(),()=>0.4);
  const first=act(match,match.currentSeat,{type:"pass"},"same-id");
  const second=applyMatchAction(first.state,first.state.seats[first.state.currentSeat].userId,{type:"pass"},"same-id");
  assert.equal(second.duplicate,true);
  assert.equal(second.state.bidHistory.length,1);
});

test("Sun and Hokom use the Saudi card-point rounding and tie-break rules", () => {
  assert.equal(contractTargetPoints("sun"),65);
  assert.equal(contractTargetPoints("hokom"),81);
  const sun = scoreRound([66,64],{type:"sun",team:0});
  assert.equal(sun.made,true);
  assert.deepEqual(sun.gamePoints,[14,12]);
  assert.equal(sun.totalGamePoints,26);
  const failedSun = scoreRound([64,66],{type:"sun",team:0});
  assert.equal(failedSun.made,false);
  assert.deepEqual(failedSun.gamePoints,[0,26]);
  const hokom = scoreRound([82,80],{type:"hokom",team:0});
  assert.deepEqual(hokom.gamePoints,[8,8]);
  assert.equal(hokom.totalGamePoints,16);
  const sunTie = scoreRound([65,65],{type:"sun",team:0});
  assert.equal(sunTie.made,true);
  assert.deepEqual(sunTie.gamePoints,[13,13]);
  const hokomTie = scoreRound([81,81],{type:"hokom",team:0});
  assert.equal(hokomTie.made,true);
  assert.deepEqual(hokomTie.gamePoints,[8,8]);
  const hokomFall = scoreRound([80,82],{type:"hokom",team:0});
  assert.equal(hokomFall.made,false);
  assert.deepEqual(hokomFall.gamePoints,[0,16]);
});

test("Kaboot scores 44 in Sun and 25 in Hokom", () => {
  assert.deepEqual(scoreRound([130,0],{type:"sun",team:0},[8,0]).gamePoints,[44,0]);
  assert.deepEqual(scoreRound([0,162],{type:"hokom",team:0},[0,8]).gamePoints,[0,25]);
});

test("reconnecting player receives their hand but not opponents' cards", () => {
  const match=createMatch(players(),()=>0.4);
  const view=publicMatchState(match,"1");
  assert.equal(view.seats[0].hand.length,5);
  assert.equal(view.seats[1].hand,undefined);
  assert.equal(view.faceUp.suit,match.faceUp.suit);
  assert.equal(view.currentSeat,match.currentSeat);
});

function finishSunRound(initialPoints = [0,0]) {
  let state = createMatch(players(), () => 0.42);
  const deck = makeDeck(() => 0.22);
  const hands = dealHands(deck);
  state.phase = "playing";
  state.faceUp = null;
  state.stock = [];
  state.contract = {type:"sun",bidderSeat:1,team:1,trumpSuit:null,ashkal:false};
  state.buyerSeat = 1;
  state.hostId = "1";
  state.matchPoints = [...initialPoints];
  state.targetScore = 152;
  state.seats.forEach((player, seat) => { player.hand = hands[seat]; });
  state.currentSeat = 1;
  let counter = 0;
  while (state.phase === "playing" && counter < 40) {
    const seat = state.currentSeat;
    const card = legalCards(state.seats[seat].hand,state.trick,state.contract,seat)[0];
    state = applyMatchAction(state,state.seats[seat].userId,{type:"play",card:cardKey(card)},"round-card-" + counter).state;
    counter++;
  }
  assert.equal(counter,32);
  assert.equal(state.phase,"round_complete");
  return state;
}

test("a player may declare projects on their turn after the first player has played", () => {
  let state=createMatch(players(),()=>0.42);
  const deck=makeDeck(()=>0.22);
  const hands=dealHands(deck);
  state.phase="playing";
  state.faceUp=null; state.stock=[];
  state.contract={type:"sun",bidderSeat:1,team:1,trumpSuit:null,ashkal:false};
  state.buyerSeat=1;
  state.seats.forEach((player,seat)=>{player.hand=hands[seat];});
  state.projectCandidatesBySeat=state.seats.map((player,seat)=>detectProjects(player.hand,state.contract,seat));
  const first=legalCards(state.seats[1].hand,[],state.contract,1)[0];
  state=applyMatchAction(state,"2",{type:"play",card:cardKey(first)},"project-first-card").state;
  const declared=applyMatchAction(state,"3",{type:"declare_projects"},"project-second-seat-declare");
  assert.equal(declared.event.type,"projects_declared");
  assert.equal(declared.state.projectsDeclaredBySeat[2],true);
  assert.equal(declared.state.seats[2].hand.length,8);
});

test("project declarations are server-verified, one per seat, and scored into the match", () => {
  let state = createMatch(players(), () => 0.42);
  const deck = makeDeck(() => 0.22);
  const hands = dealHands(deck);
  state.phase = "playing";
  state.faceUp = null;
  state.stock = [];
  state.contract = {type:"sun",bidderSeat:1,team:1,trumpSuit:null,ashkal:false};
  state.buyerSeat = 1;
  state.hostId = "1";
  state.seats.forEach((player, seat) => { player.hand = hands[seat]; });
  state.currentSeat = 1;
  const declared = act(state,1,{type:"declare_projects"},"project-declare");
  assert.equal(declared.event.type,"projects_declared");
  assert.equal(declared.state.currentSeat,1);
  assert.throws(()=>act(declared.state,1,{type:"declare_projects"},"project-declare-again"),/already declared/);
  assert.equal(publicMatchState(declared.state,"2").myProjectsDeclared,true);
  assert.equal(publicMatchState(declared.state,"3").projectDeclarations[1].projects,undefined);
  let finished = declared.state;
  let counter = 0;
  while (finished.phase === "playing" && counter < 32) {
    const seat = finished.currentSeat;
    const card = legalCards(finished.seats[seat].hand,finished.trick,finished.contract,seat)[0];
    finished = applyMatchAction(finished,finished.seats[seat].userId,{type:"play",card:cardKey(card)},"project-round-"+counter).state;
    counter++;
  }
  assert.equal(finished.phase,"round_complete");
  assert.ok(finished.roundResult.projectPoints);
  assert.deepEqual(finished.matchPoints,finished.roundResult.gamePoints);
  assert.equal(finished.declarationsClosed,true);
});

test("Hokom doubling escalates Double → Three → Four → Gahwa and closes on buyer", () => {
  let state=createMatch(players(),()=>0.4);
  const trump=state.faceUp.suit;
  state=act(state,1,{type:"hokom",trumpSuit:trump},"double-test-buy").state;
  for(let i=0;i<3;i++) state=act(state,state.currentSeat,{type:"pass"},"double-test-auction-"+i).state;
  assert.equal(state.phase,"doubling");
  assert.equal(state.currentSeat,2);
  state=act(state,2,{type:"double",locked:true},"double-test-double").state;
  assert.equal(state.doubling.multiplier,2);
  assert.equal(state.currentSeat,1);
  state=act(state,1,{type:"three"},"double-test-three").state;
  assert.equal(state.doubling.multiplier,3);
  assert.equal(state.currentSeat,2);
  state=act(state,2,{type:"four",locked:false},"double-test-four").state;
  assert.equal(state.doubling.multiplier,4);
  assert.equal(state.currentSeat,1);
  state=act(state,1,{type:"gahwa"},"double-test-gahwa").state;
  assert.equal(state.phase,"playing");
  assert.equal(state.gahwa,true);
  assert.equal(state.contract.locked,false);
  assert.throws(()=>act(state,2,{type:"play",card:cardKey(state.seats[2].hand[0])},"double-wrong-turn"),/not your turn/);
});

test("Hokom double can be declined by both opposing players", () => {
  let state=createMatch(players(),()=>0.4);
  state=act(state,1,{type:"hokom",trumpSuit:state.faceUp.suit},"decline-buy").state;
  for(let i=0;i<3;i++) state=act(state,state.currentSeat,{type:"pass"},"decline-auction-"+i).state;
  state=act(state,2,{type:"pass"},"decline-double-1").state;
  state=act(state,0,{type:"pass"},"decline-double-2").state;
  assert.equal(state.phase,"playing");
  assert.equal(state.doubling.final,true);
  assert.equal(state.doubling.multiplier,1);
});

test("match score accumulates and host can start the next deal with dealer rotation", () => {
  const completed = finishSunRound();
  assert.equal(completed.matchPoints[0] + completed.matchPoints[1],26);
  const next = applyMatchAction(completed,"1",{type:"next_round"},"next-deal").state;
  assert.equal(next.phase,"bidding");
  assert.equal(next.dealer,1);
  assert.deepEqual(next.matchPoints,completed.matchPoints);
  assert.equal(next.seats[0].hand.length,5);
  assert.throws(()=>applyMatchAction(completed,"2",{type:"next_round"},"not-host"),/host/);
});

test("repeated next-round request is idempotent", () => {
  const completed = finishSunRound();
  const first = applyMatchAction(completed,"1",{type:"next_round"},"once");
  const second = applyMatchAction(first.state,"1",{type:"next_round"},"once");
  assert.equal(second.duplicate,true);
  assert.equal(second.state.round,first.state.round);
});

test("stale concurrent move is rejected after the first move advances the turn", () => {
  const match=createMatch(players(),()=>0.4);
  const first=act(match,match.currentSeat,{type:"pass"},"move-one");
  assert.throws(
    ()=>applyMatchAction(first.state,match.seats[match.currentSeat].userId,{type:"pass"},"move-two"),
    /not your turn/
  );
});

test("startNextRound preserves the match score", () => {
  const state = finishSunRound();
  const next = startNextRound(state);
  assert.deepEqual(next.matchPoints,state.matchPoints);
  assert.equal(next.dealer,1);
});

test("a match tied at or above 152 continues for a deciding hand", () => {
  const baseline = finishSunRound();
  const start = baseline.roundResult.gamePoints.map(points=>152-points);
  const tied = finishSunRound(start);
  assert.deepEqual(tied.matchPoints,[152,152]);
  assert.equal(tied.phase,"round_complete");
  const next = startNextRound(tied);
  assert.equal(next.phase,"bidding");
  assert.deepEqual(next.matchPoints,[152,152]);
});
