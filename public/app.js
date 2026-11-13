const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const translations = {
 en:{welcome:"Play. Compete. Win.",eyebrow:"YOUR DAILY PLAYGROUND",heroTitle:'Ready for a<br><em>challenge?</em>',heroDesc:"Play quick games, earn points and climb the leaderboard.",playNow:"Play now",points:"YOUR POINTS",rank:"YOUR RANK",streak:"STREAK",choose:"PICK YOUR MODE",games:"Popular games",quiz:"Brain Quiz",quizSub:"Think fast · 10 rounds",memory:"Memory Match",memorySub:"Train your memory",reaction:"Speed Tap",reactionSub:"Test your reflexes",puzzle:"Number Puzzle",puzzleSub:"Find the missing number",ad:"A small ad keeps the games free. VIP members enjoy an ad-light experience.",vipTitle:"Level up your game",vipDesc:"Exclusive challenges, bonus points and fewer ads.",vipBtn:"Explore VIP",community:"THE COMMUNITY",leader:"Top players",home:"Home",gamesNav:"Games",ranks:"Ranks",profile:"Profile",correct:"Correct! +10 points",wrong:"Not quite. Try again!",next:"Next question",done:"Great game!",close:"Close",tapStart:"Tap when the color turns green!",wait:"Wait for green…",tapNow:"TAP NOW!",tooSoon:"Too soon! Try again.",yourTime:"Your reaction time",playAgain:"Play again",moves:"Moves",vipInfo:"VIP includes exclusive game modes, bonus points and an ad-light experience. Payments are not enabled in this demo.",subscribe:"VIP subscription coming soon",memoryInfo:"Find matching pairs. This demo shows the game flow.",puzzleInfo:"What number comes next?",adLabel:"ADVERTISEMENT"},
 ar:{welcome:"العب. نافس. اربح.",eyebrow:"مساحتك اليومية للعب",heroTitle:'هل أنت مستعد<br><em>للتحدي؟</em>',heroDesc:"العب ألعاباً سريعة واجمع النقاط واصعد في لوحة المتصدرين.",playNow:"العب الآن",points:"نقاطك",rank:"ترتيبك",streak:"التتابع",choose:"اختر طريقة اللعب",games:"الألعاب الشائعة",quiz:"اختبار الذكاء",quizSub:"فكّر بسرعة · 10 جولات",memory:"تحدي الذاكرة",memorySub:"درّب ذاكرتك",reaction:"اختبار السرعة",reactionSub:"اختبر سرعة استجابتك",puzzle:"لغز الأرقام",puzzleSub:"اكتشف الرقم الناقص",ad:"إعلان بسيط يساعدنا على إبقاء الألعاب مجانية. أعضاء VIP يتمتعون بإعلانات أقل.",vipTitle:"ارتقِ بمستوى لعبك",vipDesc:"تحديات حصرية ونقاط إضافية وإعلانات أقل.",vipBtn:"اكتشف VIP",community:"مجتمع اللاعبين",leader:"أفضل اللاعبين",home:"الرئيسية",gamesNav:"الألعاب",ranks:"الترتيب",profile:"حسابي",correct:"إجابة صحيحة! +10 نقاط",wrong:"ليست الإجابة الصحيحة، حاول مجدداً!",next:"السؤال التالي",done:"أحسنت اللعب!",close:"إغلاق",tapStart:"اضغط عندما يتحول اللون إلى الأخضر!",wait:"انتظر اللون الأخضر…",tapNow:"اضغط الآن!",tooSoon:"ضغطت مبكراً! حاول مجدداً.",yourTime:"زمن الاستجابة",playAgain:"العب مجدداً",moves:"المحاولات",vipInfo:"تشمل VIP أنماط لعب حصرية ونقاطاً إضافية وتجربة بإعلانات أقل. الدفع غير مفعّل في هذه النسخة التجريبية.",subscribe:"اشتراك VIP قريباً",memoryInfo:"اعثر على الأزواج المتطابقة. هذه نسخة تجريبية لتجربة اللعب.",puzzleInfo:"ما الرقم التالي؟",adLabel:"إعلان"}
};
let lang = "en";
let points = 120;
let quizIndex = 0;
const questions = [
 {q:"Which planet is known as the Red Planet?",a:["Venus","Mars","Jupiter"],correct:1,ar:"ما الكوكب المعروف بالكوكب الأحمر؟",opts:["الزهرة","المريخ","المشتري"]},
 {q:"What is 12 × 8?",a:["86","96","108"],correct:1,ar:"كم يساوي ١٢ × ٨؟",opts:["٨٦","٩٦","١٠٨"]},
 {q:"How many sides does a hexagon have?",a:["5","6","8"],correct:1,ar:"كم ضلعاً للشكل السداسي؟",opts:["٥","٦","٨"]},
 {q:"Which is the largest ocean?",a:["Atlantic","Indian","Pacific"],correct:2,ar:"ما أكبر محيط في العالم؟",opts:["الأطلسي","الهندي","الهادئ"]}
];
const $ = id => document.getElementById(id);
function t(k){return translations[lang][k] || k}
function setLang(next){lang=next;document.documentElement.lang=lang;document.body.classList.toggle("rtl",lang==="ar");$("langBtn").textContent=lang==="en"?"العربية":"English";$("welcome").textContent=t("welcome");$("heroEyebrow").textContent=t("eyebrow");$("heroTitle").innerHTML=t("heroTitle");$("heroDesc").textContent=t("heroDesc");$("playNowText").textContent=t("playNow");$("pointsLabel").textContent=t("points");$("rankLabel").textContent=t("rank");$("streakLabel").textContent=t("streak");$("chooseLabel").textContent=t("choose");$("gamesTitle").textContent=t("games");$("adText").textContent=t("ad");$("vipTitle").textContent=t("vipTitle");$("vipDesc").textContent=t("vipDesc");$("vipBtn").firstChild.textContent=t("vipBtn")+" ";$("communityLabel").textContent=t("community");$("leaderTitle").textContent=t("leader");$("homeNav").textContent=t("home");$("gamesNavText").textContent=t("gamesNav");$("rankNavText").textContent=t("ranks");$("profileNavText").textContent=t("profile");document.querySelectorAll("[data-i18n]").forEach(el=>el.textContent=t(el.dataset.i18n));}
function showModal(html){$("gameContent").innerHTML=html;$("gameModal").classList.remove("hidden")}
function closeModal(){$("gameModal").classList.add("hidden")}
async function addPoints(game){
  try {
    const response = await fetch("/api/score", {
      method: "POST",
      headers: {"Content-Type":"application/json","X-Telegram-Init-Data":tg?.initData || ""},
      body: JSON.stringify({game})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save points");
    points = data.points;
    $("points").textContent = points;
    return true;
  } catch (error) {
    console.error("Score save failed:", error);
    const feedback = $("feedback") || $("puzzleFeedback");
    if (feedback) feedback.textContent = error.message;
    return false;
  }
}
async function loadProfile(){
  if (!tg?.initData) {
    $("points").textContent = "—";
    return;
  }
  try {
    const response = await fetch("/api/me", {headers: {"X-Telegram-Init-Data": tg.initData}});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load profile");
    points = data.points;
    $("points").textContent = points;
    if (data.firstName) $("welcome").textContent = "Hi, " + data.firstName + "!";
  } catch (error) {
    console.error("Profile load failed:", error);
    $("points").textContent = "—";
  }
}
function startQuiz(){quizIndex=0;renderQuestion()}
function renderQuestion(){const q=questions[quizIndex%questions.length];const prompt=lang==="en"?q.q:q.ar;const opts=lang==="en"?q.a:q.opts;showModal(`<h2>🧠 ${t("quiz")}</h2><p class="muted">${quizIndex+1} / 10</p><h3>${prompt}</h3>${opts.map((x,i)=>`<button class="answer" data-answer="${i}">${x}</button>`).join("")}<p id="feedback" class="muted"></p>`);document.querySelectorAll("[data-answer]").forEach(b=>b.onclick=async()=>{const ok=Number(b.dataset.answer)===q.correct;if(ok){await addPoints("quiz_correct");$("feedback").textContent=t("correct")}else{$("feedback").textContent=t("wrong")}setTimeout(()=>{quizIndex++;if(quizIndex>=10){showModal(`<h2>🏆 ${t("done")}</h2><p class="muted">${lang==="en"?"Your points":"نقاطك"}: ${points}</p><button class="game-action" id="again">${t("playAgain")}</button>`);$("again").onclick=startQuiz}else renderQuestion()},650)})}
function startMemory(){const icons=["🍋","🍇","🍉","🍒","🍋","🍇","🍉","🍒"].sort(()=>Math.random()-.5);let open=[],matched=0,moves=0;showModal(`<h2>🧩 ${t("memory")}</h2><p class="muted">${t("memoryInfo")}</p><p class="muted">${t("moves")}: <b id="moves">0</b></p><div class="memory-grid">${icons.map((_,i)=>`<button class="answer mem" data-i="${i}">❔</button>`).join("")}</div>`);document.querySelectorAll(".mem").forEach(b=>b.onclick=async()=>{const i=+b.dataset.i;if(b.disabled||open.some(x=>x.i===i))return;b.textContent=icons[i];open.push({i,icon:icons[i],el:b});if(open.length===2){moves++;$("moves").textContent=moves;const pair=open[0].icon===open[1].icon;if(pair){open.forEach(x=>{x.el.disabled=true;x.el.textContent=x.icon});matched+=2;if(matched===8){await addPoints("memory_complete");setTimeout(()=>showModal(`<h2>🎉 ${t("done")}</h2><p>${t("moves")}: ${moves}</p><p>${t("correct")}</p>`),350)}}else{const pairNow=[...open];setTimeout(()=>pairNow.forEach(x=>x.el.textContent="❔"),650)}open=[]}})}
function startReaction(){showModal(`<h2>⚡ ${t("reaction")}</h2><p class="muted">${t("tapStart")}</p><button class="game-action" id="reactionArea">${t("wait")}</button>`);let ready=false,started=0,timer;const area=$("reactionArea");const delay=1200+Math.random()*2500;timer=setTimeout(()=>{ready=true;started=performance.now();area.textContent=t("tapNow");area.style.background="#16a36b"},delay);area.onclick=async()=>{if(!ready){clearTimeout(timer);area.textContent=t("tooSoon");setTimeout(startReaction,900);return}const ms=Math.round(performance.now()-started);if(ms<500)await addPoints("reaction_fast");showModal(`<h2>⚡ ${t("yourTime")}</h2><div class="big-number">${ms} ms</div><p class="muted">${ms<250?"Lightning fast!":ms<400?"Great reflexes!":"Keep practicing!"}</p><button class="game-action" id="again">${t("playAgain")}</button>`);$("again").onclick=startReaction}}
function startPuzzle(){showModal(`<h2>🔢 ${t("puzzle")}</h2><p>${t("puzzleInfo")}</p><div class="big-number">2 · 4 · 8 · 16 · ?</div>${[20,24,32,36].map(n=>`<button class="answer" data-num="${n}">${n}</button>`).join("")}<p id="puzzleFeedback" class="muted"></p>`);document.querySelectorAll("[data-num]").forEach(b=>b.onclick=async()=>{if(+b.dataset.num===32){$("puzzleFeedback").textContent=t("correct");await addPoints("puzzle_correct")}else $("puzzleFeedback").textContent=t("wrong")})}
function openVip(){showModal(`<h2>⭐ VIP CLUB</h2><p class="muted">${t("vipInfo")}</p><button class="game-action" disabled>${t("subscribe")}</button>`)}
document.querySelectorAll("[data-game]").forEach(b=>b.onclick=()=>({quiz:startQuiz,memory:startMemory,reaction:startReaction,puzzle:startPuzzle}[b.dataset.game])());
$("langBtn").onclick=()=>setLang(lang==="en"?"ar":"en");
$("playNow").onclick=()=>startQuiz();
$("vipBtn").onclick=openVip;
$("closeModal").onclick=closeModal;
$("gameModal").onclick=e=>{if(e.target===$("gameModal"))closeModal()};
$("gamesNav").onclick=()=>document.getElementById("gamesGrid").scrollIntoView({behavior:"smooth"});
$("rankNav").onclick=()=>document.querySelector(".leaderboard").scrollIntoView({behavior:"smooth"});
$("profileNav").onclick=()=>showModal(`<h2>👤 ${t("profile")}</h2><p class="muted">${lang==="en"?"Player":"اللاعب"}: ${tg?.initDataUnsafe?.user?.first_name || "Guest"}</p><p>${t("points")}: <b>${points}</b></p>`);
setLang("en");
loadProfile();
if(tg?.initDataUnsafe?.user?.first_name){$("welcome").textContent=`Hi, ${tg.initDataUnsafe.user.first_name}!`;}
