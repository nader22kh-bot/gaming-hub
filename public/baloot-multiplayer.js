(function(){
  const tg=window.Telegram?.WebApp;
  let timer=null, reconnectTimer=null, source=null, code=null, lastState=null, connecting=false;
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
  function stop(){
    if(timer){clearInterval(timer);timer=null;}
    if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
    if(source){source.close();source=null;}
    connecting=false;
  }
  function err(e){const el=$("multiError");if(el)el.textContent=e.message;}
  function open(){
    stop();code=null;lastState=null;
    const startParam=tg?.initDataUnsafe?.start_param||"";
    if(startParam.startsWith("baloot_")){
      const inviteCode=startParam.slice(7).toUpperCase();
      if(/^[A-HJ-NP-Z2-9]{6}$/.test(inviteCode)){
        code=inviteCode;
        api("/api/baloot/rooms/"+code+"/join","POST",{})
          .then(d=>render(d.room))
          .catch(e=>modal("<h2>Baloot</h2><p class='muted'>"+escape(e.message)+"</p>"));
        return;
      }
    }
    showMenu();
  }
  function showMenu(){
    stop();code=null;lastState=null;
    modal(`<div class="multi-baloot"><div class="baloot-top"><span>🃏 BALOOT · MULTIPLAYER</span><span>4 PLAYERS</span></div>
      <h2>${t("Play with friends","العب مع أصدقائك")}</h2>
      <p class="muted">${t("Create a private table or join with a six-character invite code.","أنشئ طاولة خاصة أو انضم باستخدام رمز دعوة من 6 أحرف.")}</p>
      <button class="game-action" id="multiCreate">${t("＋ Create private table","＋ إنشاء طاولة خاصة")}</button>
      <div class="multi-join"><input id="multiCode" maxlength="6" autocomplete="off" placeholder="${t("Enter room code","أدخل رمز الطاولة")}" aria-label="Room code"><button class="game-action" id="multiJoin">${t("Join table","انضم للطاولة")}</button></div>
      <p id="multiError" class="muted"></p>
    </div>`);
    $("multiCreate").onclick=async()=>{try{const d=await api("/api/baloot/rooms","POST",{});render(d.room);}catch(e){err(e);}};
    $("multiJoin").onclick=async()=>{try{
      const value=$("multiCode").value.trim().toUpperCase();
      if(!/^[A-HJ-NP-Z2-9]{6}$/.test(value))throw new Error(t("Enter a valid six-character code.","أدخل رمزاً صحيحاً من 6 أحرف."));
      const d=await api("/api/baloot/rooms/"+value+"/join","POST",{});
      render(d.room);
    }catch(e){err(e);}};
  }
  async function connectLive(){
    if(!code||connecting)return;
    connecting=true;
    try{
      const result=await api("/api/baloot/rooms/"+code+"/stream-token","POST",{});
      if(source)source.close();
      source=new EventSource("/api/baloot/rooms/"+code+"/events?token="+encodeURIComponent(result.token));
      source.onmessage=event=>{
        try{
          const room=JSON.parse(event.data);
          if(JSON.stringify(room)!==JSON.stringify(lastState))render(room,false);
        }catch(error){console.warn("Invalid Baloot live update",error);}
      };
      source.onerror=()=>{
        if(!source||source.readyState===EventSource.CLOSED){
          if(source){source.close();source=null;}
          if(reconnectTimer)clearTimeout(reconnectTimer);
          reconnectTimer=setTimeout(()=>{connecting=false;connectLive();},1800);
        }
      };
      if(!timer)timer=setInterval(refresh,5000);
    }catch(error){
      console.warn("Baloot live stream unavailable; using refresh fallback",error);
      if(!timer)timer=setInterval(refresh,1800);
    }finally{connecting=false;}
  }
  function render(room,ensureStream=true){
    lastState=room;code=room.code;
    if(ensureStream&&!source&&!connecting)connectLive();
    if(room.phase==="lobby")renderLobby(room);
    else renderGame(room);
  }
  function renderLobby(room){
    const seats=room.seats.map((p,i)=>`<div class="multi-seat"><span class="multi-seat-no">${i+1}</span><span>${p?escape(p.name):t("Waiting for player…","بانتظار لاعب…")}</span><b class="${p?.ready?"ready":""}">${p?(p.ready?t("Ready ✓","جاهز ✓"):t("Not ready","غير جاهز")):"—"}</b></div>`).join("");
    const me=room.seats.find(p=>p?.isMe);
    const invite="https://t.me/GamingHub2026Bot?startapp=baloot_"+room.code;
    modal(`<div class="multi-baloot"><div class="baloot-top"><span>🔒 ${t("PRIVATE TABLE","طاولة خاصة")}</span><span>${room.seats.filter(Boolean).length}/4</span></div>
      <h2>${t("Room","الطاولة")} · <strong class="room-code">${room.code}</strong></h2>
      <p class="muted">${t("Share the invite with three friends. All four players must be ready to deal.","شارك الدعوة مع ثلاثة أصدقاء. يجب أن يكون اللاعبون الأربعة جاهزين لبدء اللعب.")}</p>
      <button class="answer" id="multiShare">🔗 ${t("Share invite","مشاركة الدعوة")}</button>
      <div class="multi-seats">${seats}</div>
      <button class="game-action" id="multiReady">${me?.ready?t("Cancel ready","إلغاء الجاهزية"):t("I'm ready","أنا جاهز")}</button>
      <p class="muted" id="multiError"></p>
    </div>`);
    $("multiShare").onclick=()=>{const url="https://t.me/share/url?url="+encodeURIComponent(invite)+"&text="+encodeURIComponent(t("Join my Baloot table. Room code: ","انضم إلى طاولة البلوت. رمز الطاولة: ")+room.code);tg?.openTelegramLink?tg.openTelegramLink(url):navigator.clipboard?.writeText(invite);};
    $("multiReady").onclick=async()=>{try{const d=await api("/api/baloot/rooms/"+room.code+"/ready","POST",{ready:!me?.ready});render(d.room);}catch(e){err(e);}};
  }
  function renderGame(room){
    const mySeat=room.seats.find(p=>p.isMe);
    const myTurn=Boolean(mySeat&&room.currentSeat===mySeat.seat);
    const seats=room.seats.map(p=>`<div class="multi-seat ${room.currentSeat===p.seat?"active-turn":""}"><span>${p.seat+1}. ${escape(p.name)} · ${p.team===0?t("Team A","الفريق أ"):t("Team B","الفريق ب")}</span><b>${p.cardsCount} 🂠</b></div>`).join("");
    const trick=room.trick?.length?room.trick.map(p=>`<span class="trick-card">${p.seat+1}: ${cardLabel(p.card)}</span>`).join(""):t("No cards played in this trick yet","لم تُلعب أوراق في هذه الأكلة بعد");
    const contract=room.contract
      ?(room.contract.type==="sun"?t("Sun / صن","صن"):t("Hokom / حكم","حكم")+" "+suit(room.contract.trumpSuit))
      :t("Auction / شراء","الشراء");
    const matchScore=(room.matchPoints||[0,0]).join(" — ");
    const rawScore=(room.teamPoints||[0,0]).join(" — ");
    let controls="";
    if(room.phase==="bidding"){
      const up=room.faceUp?cardLabel(room.faceUp):"—";
      if(myTurn){
        const suits=["S","H","D","C"].filter(value=>room.bidRound!==2||value!==room.faceUp?.suit);
        const hokomControl=room.bidRound===1
          ?`<button class="game-action" data-bid="hokom">${t("Hokom","حكم")} ${suit(room.faceUp?.suit)}</button>`
          :`<select id="multiTrump" aria-label="Trump suit">${suits.map(value=>`<option value="${value}">${suit(value)}</option>`).join("")}</select><button class="game-action" data-bid="hokom">${t("Hokom","حكم")}</button>`;
        const ashkalAllowed=room.bidRound===1&&(mySeat.seat===room.dealer||mySeat.seat===(room.dealer+3)%4)&&room.faceUp?.rank!=="A";
        controls=`<div class="multi-controls"><button class="game-action" data-bid="sun">☀️ ${t("Sun","صن")}</button>${hokomControl}${ashkalAllowed?`<button class="answer" data-bid="ashkal">${t("Ashkal · Sun for partner","أشكل · صن للشريك")}</button>`:""}<button class="answer" data-bid="pass">${t("Pass","بس")}</button></div>`;
      }else controls=`<p class="muted">${t("Waiting for the current bidder…","بانتظار المزايد الحالي…")}</p>`;
      controls+=`<div class="baloot-upcard"><b>${t("Up-card","الورقة المكشوفة")}</b><span>${escape(up)}</span><small>${t("Auction round","جولة الشراء")} ${room.bidRound||1}/2</small></div>`;
    }else if(room.phase==="doubling"){
      const d=room.doubling||{};
      const canRespond=d.nextActor===mySeat?.seat;
      if(myTurn&&d.level==="normal"){
        controls=`<p>${t("The opposing team may double the contract","للفريق المقابل حق الدبل")}</p>
          <div class="multi-controls">
            <button class="game-action" data-double="double" data-lock="false">${t("Double · Open","دبل مفتوح")}</button>
            <button class="answer" data-double="double" data-lock="true">${t("Double · Closed","دبل مقفل")}</button>
            <button class="answer" data-double="pass">${t("Pass","ولا")}</button>
          </div>`;
      }else if(myTurn&&canRespond&&d.level==="double"&&mySeat.seat===d.buyerSeat){
        controls=`<p>${t("Respond to the double","الرد على الدبل")}</p><div class="multi-controls">
          <button class="game-action" data-double="three">${t("Three ×3","ثري ×3")}</button>
          <button class="answer" data-double="accept">${t("Accept","قبول")}</button></div>`;
      }else if(myTurn&&canRespond&&d.level==="three"&&mySeat.seat===d.doublerSeat){
        controls=`<p>${t("Respond to Three","الرد على الثري")}</p><div class="multi-controls">
          <button class="game-action" data-double="four" data-lock="false">${t("Four · Open","فور مفتوح")}</button>
          <button class="answer" data-double="four" data-lock="true">${t("Four · Closed","فور مقفل")}</button>
          <button class="answer" data-double="accept">${t("Accept","قبول")}</button></div>`;
      }else if(myTurn&&canRespond&&d.level==="four"&&mySeat.seat===d.buyerSeat){
        controls=`<p>${t("Final response","الرد الأخير")}</p><div class="multi-controls">
          <button class="game-action" data-double="gahwa">${t("Gahwa ☕ · Win the match","قهوة ☕ · حسم الصكة")}</button>
          <button class="answer" data-double="accept">${t("Accept Four","قبول الفور")}</button></div>`;
      }else{
        controls=`<p class="muted">${t("Waiting for the doubling decision…","بانتظار قرار الدبل…")}</p>`;
      }
    }else if(room.phase==="playing"&&myTurn){
      const projectButton=room.projectWindowOpen&&!room.myProjectsDeclared
        ?`<button class="answer" id="multiDeclareProjects">${t("Declare projects","إعلان المشاريع")}</button>`
        :"";
      const declarations=(room.projectDeclarations||[]).filter(item=>item.declared).map(item=>
        `<span class="trick-card">${item.seat+1}: ${(item.projects||[]).map(p=>t(p.type,p.type)).join(", ")||t("No projects","لا توجد مشاريع")}</span>`
      ).join("");
      controls=`${projectButton}${declarations?`<div class="multi-trick">${declarations}</div>`:""}<div class="multi-hand">${(mySeat?.hand||[]).map(c=>`<button class="playing-card ${["H","D"].includes(c.suit)?"red-card":""}" data-card="${cardKey(c)}" data-announce-baloot="${room.balootAnnouncementCard===cardKey(c)?"true":"false"}"><small>${escape(c.rank)}</small><strong>${suit(c.suit)}</strong>${room.balootAnnouncementCard===cardKey(c)?`<small>${t("BALOOT!","بلوت!")}</small>`:""}</button>`).join("")}</div>`;
    }else if(room.phase==="round_complete"){
      const result=room.roundResult||{};
      const host=room.hostSeat===mySeat?.seat;
      controls=`<div class="baloot-reward">${t("Round complete","انتهت الجولة")}<br>
        ${result.made?t("Contract made","نجح الشراء"):t("Contract fell · defenders take the hand","سقط الشراء · الخصم يأخذ اليد")}<br>
        ${t("Card points","أبناط الورق")}: ${(result.teamPoints||[0,0]).join(" — ")}<br>
        ${t("Game points added","القيد المضاف")}: ${(result.gamePoints||[0,0]).join(" — ")}<br>
        ${t("Project points","نقاط المشاريع")}: ${(result.projectPoints||[0,0]).join(" — ")}<br>
        ${t("Match score","نتيجة الصكة")}: ${(result.matchPoints||room.matchPoints||[0,0]).join(" — ")}
      </div>${host?`<button class="game-action" id="multiNext">${t("Deal next hand","وزّع اليد التالية")}</button>`:`<p class="muted">${t("Waiting for the host to deal again…","بانتظار صاحب الطاولة لبدء اليد التالية…")}</p>`}`;
    }else if(room.phase==="match_complete"){
      const winner=(room.matchPoints||[0,0]).indexOf(Math.max(...(room.matchPoints||[0,0])));
      controls=`<div class="baloot-reward">🏆 ${t("Match complete","انتهت الصكة")}<br>
        ${t("Winning team","الفريق الفائز")} ${winner===0?"A":"B"}<br>
        ${t("Final score","النتيجة النهائية")}: ${matchScore}
      </div><button class="game-action" id="multiBack">${t("Back to Baloot menu","العودة لقائمة البلوت")}</button>`;
    }else{
      controls=`<p class="muted">${myTurn?t("Your turn","دورك الآن"):t("Waiting for turn","بانتظار دورك")}</p>`;
    }
    const auction=(room.bidHistory||[]).slice(-6).map(item=>{
      const label=item.bid==="pass"?t("Pass","بس"):item.bid==="sun"?t("Sun","صن"):item.bid==="ashkal"?t("Ashkal","أشكل"):t("Hokom","حكم");
      return `<span class="trick-card">${item.seat+1}: ${label}</span>`;
    }).join("");
    modal(`<div class="multi-baloot"><div class="baloot-top"><span>🃏 ${t("LIVE MATCH","مباراة مباشرة")}</span><span>${t("ROUND","جولة")} ${room.round}</span></div>
      <div class="multi-score"><span>${contract}</span><b>${t("Card points","أبناط")}: ${rawScore}</b></div>
      <div class="multi-score"><span>${t("Match score","نتيجة الصكة")}</span><b>${matchScore} / 152</b></div>
      <div class="multi-seats">${seats}</div>
      <div class="multi-trick">${trick}</div>
      ${auction?`<div class="multi-trick">${auction}</div>`:""}
      <p class="muted">${myTurn?t("Your turn","دورك الآن"):t("Waiting for turn","بانتظار دورك")} · ${escape(room.phase)}</p>
      ${controls}<p class="muted" id="multiError"></p>
    </div>`);
    document.querySelectorAll("[data-bid]").forEach(button=>button.onclick=()=>{
      const action={type:button.dataset.bid};
      if(action.type==="hokom")action.trumpSuit=room.bidRound===1?room.faceUp.suit:$("multiTrump").value;
      send(action);
    });
    document.querySelectorAll("[data-double]").forEach(button=>button.onclick=()=>{
      const action={type:button.dataset.double};
      if(button.dataset.lock!==undefined)action.locked=button.dataset.lock==="true";
      send(action);
    });
    $("multiDeclareProjects")?.addEventListener("click",()=>send({type:"declare_projects"}));
    document.querySelectorAll("[data-card]").forEach(button=>button.onclick=()=>send({type:"play",card:button.dataset.card,announceBaloot:button.dataset.announceBaloot==="true"}));
    if($("multiNext"))$("multiNext").onclick=()=>send({type:"next_round"});
    if($("multiBack"))$("multiBack").onclick=showMenu;
  }
  function cardKey(card){return card.suit+":"+card.rank;}
  function cardLabel(value){const [s,r]=value.split(":");return r+suit(s);}
  function suit(s){return ({S:"♠",H:"♥",D:"♦",C:"♣"})[s]||s||"";}
  function escape(value){return String(value||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
  async function send(action){
    try{await api("/api/baloot/rooms/"+code+"/action","POST",{action,actionId:crypto.randomUUID()});await refresh();}
    catch(e){err(e);}
  }
  async function refresh(){
    if(!code||$("gameModal").classList.contains("hidden")){stop();return;}
    try{const data=await api("/api/baloot/rooms/"+code);if(JSON.stringify(data.room)!==JSON.stringify(lastState))render(data.room,false);}
    catch(e){if(e.message.includes("not seated")||e.message.includes("not found")){stop();err(e);}}
  }
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&code)refresh();});
  window.addEventListener("online",()=>{if(code)refresh();});
  $("closeModal")?.addEventListener("click",stop);
  window.BalootMultiplayer={open,stop};
})();