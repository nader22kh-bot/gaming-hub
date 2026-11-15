import test from "node:test";
import assert from "node:assert/strict";
import {
  detectProjects, compareProjects, settleProjects, createDoublingState,
  applyDoublingAction, openRuleCall, resolveRuleCall,
  projectDeclarationWindow, validateAkkaClaim
} from "../baloot-tournament-rules.js";

const card = (suit, rank) => ({suit,rank});
const padded = cards => {
  const hand = [...cards];
  const used = new Set(hand.map(item => item.suit + ":" + item.rank));
  for (const suit of ["D","C","H","S"]) {
    for (const rank of ["7","8","9","J","Q","K","10","A"]) {
      const key = suit + ":" + rank;
      if (!used.has(key) && hand.length < 8) {
        hand.push(card(suit, rank));
        used.add(key);
      }
    }
  }
  return hand;
};

test("detects Sira, Fifty and Hundred sequences with Saudi Sun/Hokom values", () => {
  const sun = detectProjects(padded([card("S","A"),card("S","K"),card("S","Q"),card("S","J"),card("S","10")]),{type:"sun"},0);
  assert.ok(sun.some(p=>p.type==="hundred"&&p.value===20&&p.length===5));
  const hokom = detectProjects(padded([card("S","A"),card("S","K"),card("S","Q"),card("S","J")]),{type:"hokom",trumpSuit:"H"},1);
  assert.ok(hokom.some(p=>p.type==="fifty"&&p.value===5));
  const sira = detectProjects(padded([card("S","A"),card("S","K"),card("S","Q")]),{type:"sun"},2);
  assert.ok(sira.some(p=>p.type==="sira"&&p.value===4));
});

test("detects four Aces as 400 in Sun, but not as a 400 project in Hokom", () => {
  const hand = padded(["S","H","D","C"].map(s=>card(s,"A")));
  assert.ok(detectProjects(hand,{type:"sun"},0).some(p=>p.type==="fourHundred"&&p.value===40));
  assert.ok(!detectProjects(hand,{type:"hokom",trumpSuit:"S"},0).some(p=>p.type==="fourHundred"));
});

test("detects Hokom Baloot only with trump King and Queen", () => {
  const hand = padded([card("S","K"),card("S","Q")]);
  assert.ok(detectProjects(hand,{type:"hokom",trumpSuit:"S"},0).some(p=>p.type==="baloot"&&p.value===2));
  assert.ok(!detectProjects(hand,{type:"sun"},0).some(p=>p.type==="baloot"));
});

test("Hundred sequence outranks same-value four-of-a-kind and four Aces is top Sun project", () => {
  const sequence={type:"hundred",subtype:"sequence",value:20,priority:400,seat:1};
  const kind={type:"hundred",subtype:"kind",value:10,priority:300,seat:0};
  assert.ok(compareProjects(sequence,kind,0)<0);
  const fourHundred={type:"fourHundred",value:40,priority:500,seat:3};
  assert.ok(compareProjects(fourHundred,sequence,0)<0);
});

test("equal projects are awarded by seat order from dealer's right", () => {
  const first={type:"sira",priority:150,value:4,seat:1};
  const second={type:"sira",priority:150,value:4,seat:3};
  assert.ok(compareProjects(first,second,0)<0);
});

test("only winning team's projects count, and only double doubles project points", () => {
  const bySeat=[
    [{type:"sira",seat:0,value:4,priority:150}],
    [{type:"hundred",seat:1,value:20,priority:400}],
    [{type:"fifty",seat:2,value:10,priority:200}],
    []
  ];
  const doubled=settleProjects(bySeat,{type:"sun"},0,2);
  assert.equal(doubled.winningTeam,1);
  assert.deepEqual(doubled.awarded,[0,40]);
  const tripled=settleProjects(bySeat,{type:"sun"},0,3);
  assert.deepEqual(tripled.awarded,[0,20]);
});

test("Hokom doubling follows Double → Three → Four → Gahwa with buyer/doubler turns", () => {
  let state=createDoublingState({type:"hokom",buyerSeat:0,team:0});
  state=applyDoublingAction(state,1,{type:"double",locked:true});
  assert.equal(state.multiplier,2);
  assert.equal(state.locked,true);
  state=applyDoublingAction(state,0,{type:"three"});
  assert.equal(state.multiplier,3);
  state=applyDoublingAction(state,1,{type:"four",locked:false});
  assert.equal(state.multiplier,4);
  state=applyDoublingAction(state,0,{type:"gahwa"});
  assert.equal(state.level,"gahwa");
  assert.equal(state.final,true);
});

test("only the two opposing principals may raise; out-of-turn multiplier actions fail", () => {
  let state=createDoublingState({type:"hokom",buyerSeat:0,team:0});
  assert.throws(()=>applyDoublingAction(state,0,{type:"double"}),/opposing/);
  state=applyDoublingAction(state,1,{type:"double"});
  assert.throws(()=>applyDoublingAction(state,2,{type:"three"}),/buyer/);
  assert.throws(()=>applyDoublingAction(state,3,{type:"accept"}),/turn/);
});

test("Sun Double is restricted to buyer team at 100 or less and opponents above 100", () => {
  const allowed=createDoublingState({type:"sun",buyerSeat:0,team:0},[90,110]);
  assert.equal(applyDoublingAction(allowed,1,{type:"double"}).multiplier,2);
  const blocked=createDoublingState({type:"sun",buyerSeat:0,team:0},[101,110]);
  assert.throws(()=>applyDoublingAction(blocked,1,{type:"double"}),/100/);
});

test("Gahwa is unavailable before Four and no actions follow a final decision", () => {
  const state=createDoublingState({type:"hokom",buyerSeat:0,team:0});
  assert.throws(()=>applyDoublingAction(state,0,{type:"gahwa"}),/Unknown|buyer/);
  let final=applyDoublingAction(state,1,{type:"double"});
  final=applyDoublingAction(final,0,{type:"accept"});
  assert.throws(()=>applyDoublingAction(final,0,{type:"three"}),/final/);
});

test("Qayd/Sawa/Akka calls remain pending until a server-side ruling is recorded", () => {
  const state={phase:"playing",tricks:[],trick:[]};
  const pending=openRuleCall(state,2,"qayd",{targetSeat:1,id:"q-1"});
  assert.equal(pending.pendingRuleCall.status,"pending");
  assert.throws(()=>openRuleCall(pending,0,"sawa"),/already pending/);
  const ruled=resolveRuleCall(pending,{decision:"upheld",note:"Confirmed from action history",refereeId:"host"});
  assert.equal(ruled.pendingRuleCall.status,"upheld");
  assert.throws(()=>resolveRuleCall(ruled,{decision:"rejected"}),/no pending/);
});

test("project declarations are allowed only during the first trick", () => {
  assert.equal(projectDeclarationWindow({phase:"playing",tricks:[],trick:[]}),true);
  assert.equal(projectDeclarationWindow({phase:"playing",tricks:[{}],trick:[]}),false);
  assert.equal(projectDeclarationWindow({phase:"round_complete",tricks:[],trick:[]}),false);
});

test("Akka claim is valid only when no higher unplayed card remains in that suit", () => {
  const claim=card("S","A");
  assert.equal(validateAkkaClaim(claim,[claim,card("S","K"),card("H","7")]),true);
  assert.equal(validateAkkaClaim(card("S","K"),[card("S","K"),card("S","A")]),false);
});
