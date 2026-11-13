import test from "node:test";
import assert from "node:assert/strict";
import { makeDeck, dealHands, legalCards, winningPlay, cardPoints, createMatch, applyMatchAction } from "../baloot-engine.js";

test("deck contains 32 unique cards and deals eight per player", () => {
  const deck = makeDeck(() => 0.5);
  assert.equal(deck.length, 32);
  assert.equal(new Set(deck.map(c => c.suit + ":" + c.rank)).size, 32);
  assert.deepEqual(dealHands(deck).map(h => h.length), [8, 8, 8, 8]);
});
test("players must be four distinct Telegram users", () => {
  assert.throws(() => createMatch([{userId:1},{userId:2},{userId:3},{userId:3}]));
});
test("must follow lead suit when possible", () => {
  const hand = [{suit:"H",rank:"7"},{suit:"S",rank:"A"}];
  assert.deepEqual(legalCards(hand,[{seat:0,card:{suit:"H",rank:"8"}}],{type:"sun"}),[hand[0]]);
});
test("Hokom trump is compulsory when void in the lead suit and holding trump", () => {
  const hand = [{suit:"S",rank:"7"},{suit:"D",rank:"J"}];
  assert.deepEqual(legalCards(hand,[{seat:0,card:{suit:"H",rank:"8"}}],{type:"hokom",trumpSuit:"D"}),[hand[1]]);
});
test("Hokom J and 9 carry 20 and 14 points", () => {
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
  const match=createMatch([1,2,3,4].map(userId=>({userId})),()=>0.4);
  assert.throws(()=>applyMatchAction(match,"4",{type:"pass"},"a1"),/not your turn/);
});
test("duplicate action ids do not apply twice", () => {
  const match=createMatch([1,2,3,4].map(userId=>({userId})),()=>0.4);
  const first=applyMatchAction(match,match.seats[match.currentSeat].userId,{type:"pass"},"same-id");
  const second=applyMatchAction(first.state,first.state.seats[first.state.currentSeat].userId,{type:"pass"},"same-id");
  assert.equal(second.duplicate,true);
  assert.equal(second.state.bidHistory.length,1);
});
