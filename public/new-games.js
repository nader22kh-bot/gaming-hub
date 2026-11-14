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
    let timer=null,running=false,factor=1,roundId=null,crashAt=0,startedAt=0,best=1,history=[];
    const auth=()=>({"Content-Type":"application/json","X-Telegram-Init-Data":window.Telegram?.WebApp?.initData||""});
    const post=async(url,body={})=>{const r=await fetch(url,{method:"POST",headers:auth(),body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed");return d;};
    const render=()=>modal(`<div class="crash-game">
      <div class="crash-top"><span>🚀 CRASH ARENA</span><span class="crash-live">● SERVER ROUND</span></div>
      <p class="muted">${say("Watch the multiplier rise. Cash out before the crash!","راقب ارتفاع المعامل واسحب قبل الانفجار!")}</p>
      <div class="crash-stage" id="crashStage">
        <div class="crash-stars">✦　 ·　 ✧　 ·　 ✦　 ·　 ✧</div>
        <div class="crash-orbit"></div><div class="crash-trail" id="crashTrail"></div>
        <div class="crash-rocket" id="crashRocket">🚀</div>
        <div class="crash-multiplier" id="crashMultiplier">1.00x</div>
        <div class="crash-status" id="crashStatus">${say("Ready for takeoff?","جاهز للإقلاع؟")}</div>
        <div class="crash-progress"><span id="crashProgress"></span></div>
      </div>
      <div class="crash-controls"><button class="game-action" id="crashStart">${say("🚀 START ROUND","🚀 ابدأ الجولة")}</button><button class="game-action crash-cashout" id="crashCashout" disabled>${say("💰 CASH OUT","💰 اسحب النقاط")}</button></div>
      <div class="crash-stats"><div><small>${say("LAST ROUND","الجولة السابقة")}</small><b id="crashLast">—</b></div><div><small>${say("PERSONAL BEST","أفضل معامل")}</small><b id="crashBest">1.00x</b></div><div><small>${say("REWARD","المكافأة")}</small><b id="crashReward">0 ⭐</b></div></div>
      <div class="crash-history"><small>${say("RECENT ROUNDS","آخر الجولات")}</small><div id="crashHistory">${say("No rounds yet","لا توجد جولات بعد")}</div></div>
      <p class="muted crash-note">${say("Demo game using virtual hub points only. No cash, deposits or withdrawals. Reward: 10 points per successful cash-out (15 for VIP), up to 10 daily.","لعبة تجريبية بنقاط افتراضية فقط، دون أموال أو إيداعات أو سحوبات. المكافأة 10 نقاط عند السحب الناجح (15 للـVIP)، بحد أقصى 10 مرات يومياً.")}</p>
    </div>`);
    const $id=id=>document.getElementById(id);
    const startBtn=$id("crashStart"),cashBtn=$id("crashCashout"),stage=$id("crashStage"),rocket=$id("crashRocket"),multiplier=$id("crashMultiplier"),status=$id("crashStatus");
    const stop=()=>{if(timer)clearInterval(timer);timer=null;running=false;cashBtn.disabled=true;startBtn.disabled=false;};
    const showHistory=(value,label)=>{history.unshift({value,label});history=history.slice(0,5);$id("crashHistory").innerHTML=history.map(x=>`<span class="${x.label==="WIN"?"won":"lost"}">${x.value}x</span>`).join("");};
    const boom=()=>{if(!running)return;stop();stage.classList.add("crashed");rocket.textContent="💥";$id("crashTrail").style.opacity="0";status.textContent=say("CRASHED! Try another round.","انفجر الصاروخ! حاول في جولة أخرى.");$id("crashLast").textContent=factor.toFixed(2)+"x";showHistory(factor.toFixed(2),"LOSS");};
    startBtn.onclick=async()=>{
      if(running)return;
      startBtn.disabled=true;status.textContent=say("Preparing a verified round…","جارٍ تجهيز جولة موثوقة…");
      try{
        const d=await post("/api/crash/start");
        roundId=d.roundId;crashAt=Number(d.crashAt);startedAt=Date.now();factor=1;running=true;
        stage.classList.remove("crashed");rocket.textContent="🚀";rocket.style.transform="translate(0,0)";$id("crashTrail").style.opacity="1";$id("crashProgress").style.width="0%";
        multiplier.textContent="1.00x";status.textContent=say("Flying… cash out anytime!","الصاروخ يرتفع… اسحب في أي وقت!");
        cashBtn.disabled=false;
        timer=setInterval(()=>{
          const elapsed=(Date.now()-startedAt)/1000;factor=Math.exp(elapsed*.19);
          multiplier.textContent=factor.toFixed(2)+"x";
          const rise=Math.min(125,elapsed*18);
          rocket.style.transform=`translateY(-${rise}px) rotate(-13deg)`;
          $id("crashTrail").style.height=Math.min(115,elapsed*18)+"px";
          $id("crashProgress").style.width=Math.min(100,(factor/crashAt)*100)+"%";
          if(factor>=crashAt)boom();
        },50);
      }catch(e){status.textContent=e.message;startBtn.disabled=false;}
    };
    cashBtn.onclick=async()=>{
      if(!running||!roundId)return;
      const id=roundId;cashBtn.disabled=true;status.textContent=say("Verifying cash-out…","جارٍ التحقق من السحب…");
      try{
        const d=await post("/api/crash/cashout",{roundId:id});
        stop();factor=d.factor;multiplier.textContent=factor.toFixed(2)+"x";
        $id("crashReward").textContent="+"+d.awarded+" ⭐";$id("crashLast").textContent=factor.toFixed(2)+"x";
        best=Math.max(best,factor);$id("crashBest").textContent=best.toFixed(2)+"x";
        status.textContent=say("CASHED OUT! +"+d.awarded+" points saved.","تم السحب! أضيفت "+d.awarded+" نقطة إلى رصيدك.");
        stage.classList.add("cashed");showHistory(factor.toFixed(2),"WIN");
        if(typeof window.refreshGamingHub==="function")await window.refreshGamingHub(d.points);
      }catch(e){
        stop();stage.classList.add("crashed");rocket.textContent="💥";status.textContent=e.message;
        $id("crashLast").textContent=factor.toFixed(2)+"x";showHistory(factor.toFixed(2),"LOSS");
      }
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
      modal(`<div class="basra-game"><div class="basra-head"><span>🃏 BASRA TABLE</span><span>${say("ROUND","الجولة")} ${round}</span></div><div class="basra-opponent"><span>🤖</span><b>Bot 1</b><small>${say("COMPUTER","الكمبيوتر")}</small></div><div class="basra-score"><div><small>${say("YOU","أنت")}</small><b>${player}</b></div><div class="basra-vs">VS</div><div><small>${say("CPU","الخصم")}</small><b>${computer}</b></div></div>
      <div class="basra-table"><small>${say("CARDS ON TABLE","الأوراق على الطاولة")}</small><div class="basra-cards">${table.map(c=>`<span class="basra-card ${c.red?"red":""}">${c.v}${c.s}</span>`).join("")||"—"}</div></div>
      <p class="muted">${message||say("Play a matching rank to capture it. An Ace sweeps the table. Emptying the table earns a Basra bonus.","طابق قيمة الورقة لالتقاطها. الآس يلتقط كل أوراق الطاولة. إفراغ الطاولة يمنحك مكافأة الباصرة.")}</p>
      <div class="basra-player-label">${say("YOUR HAND","أوراقك")}</div><div class="basra-hand">${hand.map((c,i)=>`<button class="basra-card ${c.red?"red":""}" data-basra="${i}">${c.v}<br>${c.s}</button>`).join("")}</div>
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