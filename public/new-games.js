(() => {
  const $ = id => document.getElementById(id);
  const isAr = () => document.documentElement.lang === "ar";
  const say = (en, ar) => isAr() ? ar : en;
  const modal = html => { $("gameContent").innerHTML = html; $("gameModal").classList.remove("hidden"); };
  const score = async game => {
    const tg = window.Telegram?.WebApp;
    const r = await fetch("/api/score",{method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Init-Data":tg?.initData||""},body:JSON.stringify({game})});
    const d = await r.json(); if(!r.ok) throw new Error(d.error||"Could not save score");
    if(typeof window.refreshGamingHub==="function") await window.refreshGamingHub(d.points);
    return d.points;
  };

  function crash(){
    let timer=null, running=false, crashed=false, factor=1, start=0, banked=false;
    const render=()=>modal(`<div class="crash-game">
      <div class="crash-top"><span>🚀 CRASH ARENA</span><span class="crash-live">● LIVE SIMULATION</span></div>
      <p class="muted">${say("Cash out before the rocket crashes. Play with hub points only.","اسحب قبل تحطم الصاروخ. اللعب بنقاط Gaming Hub فقط.")}</p>
      <div class="crash-stage" id="crashStage"><div class="crash-stars">✦　 ·　 ✧　 ·　 ✦</div><div class="crash-rocket" id="crashRocket">🚀</div><div class="crash-multiplier" id="crashMultiplier">1.00x</div><div class="crash-status" id="crashStatus">${say("Ready for takeoff?","هل أنت مستعد للإقلاع؟")}</div></div>
      <div class="crash-controls"><button class="game-action" id="crashStart">${say("🚀 START ROUND","🚀 ابدأ الجولة")}</button><button class="game-action crash-cashout" id="crashCashout" disabled>${say("💰 CASH OUT","💰 اسحب النقاط")}</button></div>
      <div class="crash-stats"><div><small>${say("LAST MULTIPLIER","آخر معامل")}</small><b id="crashLast">—</b></div><div><small>${say("BEST THIS SESSION","أفضل نتيجة")}</small><b id="crashBest">—</b></div><div><small>${say("REWARD","المكافأة")}</small><b id="crashReward">0 ⭐</b></div></div>
      <p class="muted">${say("Demo mode: no money, deposits or withdrawals. Rewards are game points and are credited only after a successful cash-out.","نسخة تجريبية: لا توجد أموال أو إيداعات أو سحوبات مالية. المكافآت نقاط لعب تُضاف عند السحب الناجح.")}</p>
    </div>`);
    const startBtn=$("crashStart"), cashBtn=$("crashCashout"), multiplier=$("crashMultiplier"), rocket=$("crashRocket"), status=$("crashStatus"), stage=$("crashStage");
    const stop=()=>{if(timer)clearInterval(timer);timer=null;running=false;cashBtn.disabled=true;startBtn.disabled=false;};
    const boom=()=>{if(!running)return;crashed=true;stop();stage.classList.add("crashed");rocket.textContent="💥";status.textContent=say("CRASHED! Better luck next round.","انفجر الصاروخ! حظاً أوفر في الجولة القادمة.");$("crashLast").textContent=factor.toFixed(2)+"x";};
    startBtn.onclick=()=>{
      if(running)return; if(timer)clearInterval(timer);
      running=true;crashed=false;banked=false;factor=1;start=performance.now();stage.classList.remove("crashed");
      rocket.textContent="🚀";multiplier.textContent="1.00x";status.textContent=say("Flying… cash out anytime!","الصاروخ يرتفع… اسحب في أي وقت!");
      startBtn.disabled=true;cashBtn.disabled=false;
      const crashAt=1.15+Math.random()*5.8;
      timer=setInterval(()=>{const elapsed=(performance.now()-start)/1000;factor=Math.exp(elapsed*0.19);multiplier.textContent=factor.toFixed(2)+"x";rocket.style.transform=`translateY(-${Math.min(115,elapsed*13)}px) rotate(-12deg)`;if(factor>=crashAt)boom();},60);
    };
    cashBtn.onclick=async()=>{
      if(!running||banked)return;banked=true;const captured=factor;stop();
      const reward=10;
      cashBtn.disabled=true;status.textContent=say("Cashed out safely! Saving your points…","تم السحب بنجاح! جارٍ حفظ نقاطك…");
      try{await score("crash_cashout");$("crashReward").textContent="+"+reward+" ⭐";status.textContent=say("Cash-out recorded! A fixed game reward was added.","تم تسجيل السحب وإضافة مكافأة اللعب.");}
      catch(e){status.textContent=e.message;}
      $("crashLast").textContent=captured.toFixed(2)+"x";
      const best=Math.max(Number(($("crashBest").textContent||"0").replace("x",""))||0,captured);$("crashBest").textContent=best.toFixed(2)+"x";
    };
  }

  function basra(){
    const suits=["♠","♥","♦","♣"], values=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
    const deck=()=>suits.flatMap(s=>values.map((v,i)=>({s,v,n:i+1,red:s==="♥"||s==="♦"}))).sort(()=>Math.random()-.5);
    let cards=[],table=[],hand=[],cpuHand=[],player=0,computer=0,round=1,locked=false;
    const draw=()=>cards.pop();
    const capture=(card,pile)=>{
      if(card.v==="A"){const taken=[...pile];pile.length=0;return taken;}
      const match=pile.findIndex(c=>c.v===card.v);
      return match>=0?[pile.splice(match,1)[0]]:[];
    };
    const scoreCapture=(taken,cleared)=>taken.reduce((sum,c)=>sum+(c.v==="A"?1:(c.v==="10"&&c.s==="♦"?2:(c.v==="2"&&c.s==="♣"?1:0))),0)+(cleared&&taken.length?10:0);
    function deal(){cards=deck();table=Array.from({length:4},draw);hand=Array.from({length:4},draw);cpuHand=Array.from({length:4},draw);player=0;computer=0;round=1;locked=false;render();}
    function render(message=""){
      modal(`<div class="basra-game"><div class="basra-head"><span>🃏 BASRA TABLE</span><span>${say("ROUND","الجولة")} ${round}</span></div><div class="basra-score"><div><small>${say("YOU","أنت")}</small><b>${player}</b></div><div class="basra-vs">VS</div><div><small>${say("CPU","الخصم")}</small><b>${computer}</b></div></div>
      <div class="basra-table"><small>${say("CARDS ON TABLE","الأوراق على الطاولة")}</small><div class="basra-cards">${table.map(c=>`<span class="basra-card ${c.red?"red":""}">${c.v}${c.s}</span>`).join("")||"—"}</div></div>
      <p class="muted">${message||say("Play a matching rank to capture it. An Ace sweeps the table. Emptying the table earns a Basra bonus.","طابق قيمة الورقة لالتقاطها. الآس يلتقط كل أوراق الطاولة. إفراغ الطاولة يمنحك مكافأة الباصرة.")}</p>
      <div class="basra-hand">${hand.map((c,i)=>`<button class="basra-card ${c.red?"red":""}" data-basra="${i}">${c.v}<br>${c.s}</button>`).join("")}</div>
      <div class="basra-actions"><button class="answer" id="basraNew">${say("New game","لعبة جديدة")}</button><span class="muted">${say("Cards left","الأوراق المتبقية")}: ${cards.length}</span></div></div>`);
      document.querySelectorAll("[data-basra]").forEach(b=>b.onclick=()=>play(Number(b.dataset.basra)));
      $("basraNew").onclick=deal;
    }
    async function finish(){
      const won=player>computer;let msg=won?say("You won the table!","فزت بالجولة!"):player===computer?say("It's a tie!","تعادل!"):say("CPU won this round. Try again!","فاز الخصم بهذه الجولة. حاول مجدداً!");
      if(won){try{await score("basra_win");msg+=say(" · +25 points"," · +25 نقطة");}catch(e){msg+=" · "+e.message;}}
      render(msg);locked=false;
    }
    function cpuTurn(){
      if(!cpuHand.length)return;
      const index=Math.floor(Math.random()*cpuHand.length),card=cpuHand.splice(index,1)[0],before=table.length;
      const taken=capture(card,table);
      if(taken.length)computer+=scoreCapture(taken,table.length===0);
      else table.push(card);
      if(!hand.length&&!cpuHand.length){
        if(cards.length){hand=Array.from({length:Math.min(4,cards.length)},draw);cpuHand=Array.from({length:Math.min(4,cards.length)},draw);round++;}
        else {finish();return;}
      }
      render(taken.length?say("CPU captured cards. Your turn!","التقط الخصم أوراقاً. دورك الآن!") : say("CPU played a card. Your turn!","لعب الخصم ورقة. دورك الآن!"));locked=false;
    }
    function play(index){
      if(locked||!hand[index])return;locked=true;
      const card=hand.splice(index,1)[0],taken=capture(card,table);
      if(taken.length)player+=scoreCapture(taken,table.length===0);
      else table.push(card);
      if(!hand.length&&!cpuHand.length&&!cards.length){finish();return;}
      cpuTurn();
    }
    deal();
  }
  window.startCrashGame=crash;
  window.startBasraGame=basra;
})();