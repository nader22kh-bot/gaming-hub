(function(){
  const tg=window.Telegram?.WebApp;
  let timer=null, code=null, lastState=null;
  const $=id=>document.getElementById(id);
  const ar=()=>document.body.classList.contains("rtl");
  const t=(en,arab)=>ar()?arab:en;
  const headers=()=>({"Content-Type":"application/json","X-Telegram-Init-Data":tg?.initData||""});
  async function api(path,method="GET",body){
    const response=await fetch(path,{method,headers:headers(),body:body?JSON.stringify(body):undefined});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Request failed");
    return data;
  }
  function modal(html){
    $("gameModal").classList.remove("hidden");
    $("gameContent").innerHTML=html;
    $("gameContent").classList.toggle("rtl",ar());
  }
  function stop(){if(timer){clearInterval(timer);timer=null;}}
  function err(e){const el=$("multiError");if(el)el.textContent=e.message;}
  function open(){
    stop();code=null;lastState=null;
    const startParam=tg?.initDataUnsafe?.start_param||"";
    if(startParam.startsWith("baloot_")){
      const inviteCode=startParam.slice(7).toUpperCase();
      if(/^[A-HJ-NP-Z2-9]{6}$/.test(inviteCode)){
        code=inviteCode;
        api("/api/baloot/rooms/"+code+"/join","POST",{}).then(d=>render(d.room)).catch(e=>{modal("<h2>Baloot</h2><p class='muted'>"+escape(e.message)+"</p>");});
        return;
      }
    }
    modal(`<div class="multi-baloot"><div class="baloot-top"><span>🃏 BALOOT · MULTIPLAYER</span><span>4 PLAYERS</span></div>
      <h2>${t("Play with friends","العب مع أصدقائك")}</h2>
      <p class="muted">${t("Create a private table or join with a six-character invite code.","أنشئ طاولة خاصة أو انضم باستخدام رمز دعوة من 6 أحرف.")}</p>
      <button class="game-action" id="multiCreate">${t("＋ Create private table","＋ إنشاء طاولة خاصة")}</button>
      <div class="multi-join"><input id="multiCode" maxlength="6" autocomplete="off" placeholder="${t("Enter room code","أدخل رمز الطاولة")}" aria-label="Room code"><button class="game-action" id="multiJoin">${t("Join table","انضم للطاولة")}</button></div>
      <p id="multiError" class="muted"></p>
    </div>`);
    $("multiCreate").onclick=async()=>{try{const d=await api("/api/baloot/rooms","POST",{});code=d.room.code;render(d.room);}catch(e){err(e);}};
    $("multiJoin").onclick=async()=>{try{const value=$("multiCode").value.trim().toUpperCase();if(!/^[A-HJ-NP-Z2-9]{6}$/.test(value))throw new Error(t("Enter a valid six-character code.","أدخل رمزاً صحيحاً من 6 أحرف."));const d=await api("/api/baloot/rooms/"+value+"/join","POST",{});code=value;render(d.room);}catch(e){err(e);}};
  }
  function render(room){
    lastState=room;code=room.code;if(!timer)timer=setInterval(refresh,1600);
    if(room.phase==="lobby"){
      const seats=room.seats.map((p,i)=>`<div class="multi-seat"><span class="multi-seat-no">${i+1}</span><span>${p?escape(p.name):t("Waiting for player…","بانتظار لاعب…")}</span><b class="${p?.ready?"ready":""}">${p?(p.ready?t("Ready ✓","جاهز ✓"):t("Not ready","غير جاهز")):"—"}</b></div>`).join("");
      const me=room.seats.find(p=>p?.isMe);
      const invite="https://t.me/GamingHub2026Bot?startapp=baloot_"+code;
      modal(`<div class="multi-baloot"><div class="baloot-top"><span>🔒 ${t("PRIVATE TABLE","طاولة خاصة")}</span><span>${room.seats.filter(Boolean).length}/4</span></div>
        <h2>${t("Room","الطاولة")} · <strong class="room-code">${code}</strong></h2>
        <p class="muted">${t("Share the code with three friends. All four players must be ready to deal.","شارك الرمز مع ثلاثة أصدقاء. يجب أن يكون اللاعبون الأربعة جاهزين لبدء اللعب.")}</p>
        <button class="answer" id="multiShare">🔗 ${t("Share invite","مشاركة الدعوة")}</button>
        <div class="multi-seats">${seats}</div>
        <button class="game-action" id="multiReady">${me?.ready?t("Cancel ready","إلغاء الجاهزية"):t("I'm ready","أنا جاهز")}</button>
        <p class="muted" id="multiError"></p>
      </div>`);
      $("multiShare").onclick=()=>{const url="https://t.me/share/url?url="+encodeURIComponent(invite)+"&text="+encodeURIComponent(t("Join my Baloot table. Room code: ","انضم إلى طاولة البلوت. رمز الطاولة: ")+code);tg?.openTelegramLink?tg.openTelegramLink(url):navigator.clipboard?.writeText(code);};
      $("multiReady").onclick=async()=>{try{const d=await api("/api/baloot/rooms/"+code+"/ready","POST",{ready:!me?.ready});render(d.room);}catch(e){err(e);}};
    }else renderGame(room);
  }
  function renderGame(room){
    const me=String(tg?.initDataUnsafe?.user?.id||"");
    const mySeat=room.seats.find(p=>p.isMe);
    const myTurn=mySeat&&room.currentSeat===mySeat.seat;
    const seats=room.seats.map(p=>`<div class="multi-seat ${room.currentSeat===p.seat?"active-turn":""}"><span>${p.seat+1}. ${escape(p.name)}</span><b>${p.cardsCount} 🂠</b></div>`).join("");
    const trick=room.trick?.length?room.trick.map(p=>`<span class="trick-card">${p.seat+1}: ${cardLabel(p.card)}</span>`).join(""):t("Waiting for cards","بانتظار الأوراق");
    let controls="";
    if(room.phase==="bidding"&&myTurn){
      controls=`<div class="multi-controls"><button class="game-action" data-bid="sun">${t("Sun ☀️","صن ☀️")}</button><button class="game-action" data-bid="hokom">${t("Hokom ♠","حكم ♠")}</button><button class="answer" data-bid="pass">${t("Pass","بس")}</button><select id="multiTrump" aria-label="Trump suit"><option value="S">♠</option><option value="H">♥</option><option value="D">♦</option><option value="C">♣</option></select></div>`;
    }else if(room.phase==="playing"&&myTurn){
      controls=`<div class="multi-hand">${(mySeat?.hand||[]).map(c=>`<button class="playing-card ${["H","D"].includes(c.suit)?"red-card":""}" data-card="${c.suit}:${c.rank}"><small>${c.rank}</small><strong>${suit(c.suit)}</strong></button>`).join("")}</div>`;
    }else if(room.phase==="round_complete"){
      controls=`<div class="baloot-reward">${t("Round complete","انتهت الجولة")} · ${t("Winning team","الفريق الفائز")} ${room.roundResult.winningTeam+1}<br>${t("Team points","نقاط الفريق")}: ${room.roundResult.teamPoints.join(" — ")}</div>`;
    }else controls=`<p class="muted">${t("Waiting for the other players…","بانتظار دور بقية اللاعبين…")}</p>`;
    modal(`<div class="multi-baloot"><div class="baloot-top"><span>🃏 ${t("LIVE MATCH","مباراة مباشرة")}</span><span>${t("ROUND","جولة")} ${room.round}</span></div>
      <div class="multi-score"><span>☀️ ${t("Sun","صن")} / ♠ ${t("Hokom","حكم")}: ${room.contract?.type||t("Bidding","مزايدة")}</span><b>${room.teamPoints[0]} — ${room.teamPoints[1]}</b></div>
      <div class="multi-seats">${seats}</div><div class="multi-trick">${trick}</div>
      <p class="muted">${myTurn?t("Your turn","دورك الآن"):t("Waiting for turn","بانتظار دورك")} · ${room.phase}</p>
      ${controls}<p class="muted" id="multiError"></p>
    </div>`);
    document.querySelectorAll("[data-bid]").forEach(b=>b.onclick=()=>send({type:b.dataset.bid,...(b.dataset.bid==="hokom"?{trumpSuit:$("multiTrump").value}:{})}));
    document.querySelectorAll("[data-card]").forEach(b=>b.onclick=()=>send({type:"play",card:b.dataset.card}));
  }
  function cardLabel(value){const [s,r]=value.split(":");return r+suit(s);}
  function suit(s){return ({S:"♠",H:"♥",D:"♦",C:"♣"})[s]||s;}
  function escape(s){return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
  async function send(action){
    try{await api("/api/baloot/rooms/"+code+"/action","POST",{action,actionId:crypto.randomUUID()});await refresh();}
    catch(e){err(e);}
  }
  async function refresh(){
    if(!code||$("gameModal").classList.contains("hidden")){stop();return;}
    try{const d=await api("/api/baloot/rooms/"+code);if(JSON.stringify(d.room)!==JSON.stringify(lastState))render(d.room);}
    catch(e){stop();err(e);}
  }
  window.BalootMultiplayer={open};
})();