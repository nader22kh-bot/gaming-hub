const tg = window.Telegram?.WebApp;
let adsgramController = null;
tg?.ready();
tg?.expand();

const translations = {
 en:{welcome:"Play. Compete. Win.",eyebrow:"YOUR DAILY PLAYGROUND",heroTitle:'Ready for a<br><em>challenge?</em>',heroDesc:"Play quick games, earn points and climb the leaderboard.",playNow:"Play now",points:"YOUR POINTS",rank:"YOUR RANK",streak:"STREAK",streakEyebrow:"YOUR DAILY STREAK",streakTitle:"Keep your streak alive",streakDaysText:"days in a row",streakBestLabel:"BEST STREAK",streakHint:"Open the app every day. Miss a day and your streak resets.",dailyRewards:"Daily login gifts",dailyRewardPlan:"Day 1–2: +10 points · Day 3: +30 · Day 7: +60 · Day 14: +110 · Day 30: +510 + exclusive badge",dailyGiftTitle:"Daily gift unlocked!",dailyGiftText:"You received",dailyGiftPoints:"points",day30Gift:"You earned the 30-day exclusive badge!",choose:"PICK YOUR MODE",games:"Popular games",quiz:"Brain Quiz",quizSub:"Think fast · 10 rounds",memory:"Memory Match",memorySub:"Train your memory",reaction:"Speed Tap",reactionSub:"Test your reflexes",puzzle:"Number Puzzle",puzzleSub:"Find the missing number",ad:"A small ad keeps the games free. VIP members enjoy an ad-light experience.",vipTitle:"Level up your game",vipDesc:"Exclusive challenges, bonus points and fewer ads.",vipBtn:"Explore VIP",community:"THE COMMUNITY",leader:"Top players",home:"Home",gamesNav:"Games",ranks:"Ranks",profile:"Profile",correct:"Correct! +10 points",wrong:"Not quite. Try again!",next:"Next question",done:"Great game!",close:"Close",tapStart:"Tap when the color turns green!",wait:"Wait for green…",tapNow:"TAP NOW!",tooSoon:"Too soon! Try again.",yourTime:"Your reaction time",playAgain:"Play again",moves:"Moves",vipInfo:"VIP includes exclusive game modes, bonus points and an ad-light experience. Payments are not enabled in this demo.",subscribe:"VIP subscription coming soon",memoryInfo:"Find matching pairs. This demo shows the game flow.",puzzleInfo:"What number comes next?",adLabel:"ADVERTISEMENT",adRewardBtn:"🎁 Watch an ad · +20 points"},
 ar:{welcome:"العب. نافس. اربح.",eyebrow:"مساحتك اليومية للعب",heroTitle:'هل أنت مستعد<br><em>للتحدي؟</em>',heroDesc:"العب ألعاباً سريعة واجمع النقاط واصعد في لوحة المتصدرين.",playNow:"العب الآن",points:"نقاطك",rank:"ترتيبك",streak:"أيام اللعب",streakEyebrow:"سلسلة أيام اللعب",streakTitle:"حافظ على تتابعك",streakDaysText:"أيام متتالية",streakBestLabel:"أفضل سلسلة",streakHint:"افتح التطبيق كل يوم. إذا فاتك يوم، تعود السلسلة إلى الصفر.",dailyRewards:"هدايا الدخول اليومية",dailyRewardPlan:"اليوم 1–2: +10 نقاط · اليوم 3: +30 · اليوم 7: +60 · اليوم 14: +110 · اليوم 30: +510 + شارة حصرية" ,dailyGiftTitle:"🎁 حصلت على هدية اليوم!",dailyGiftText:"أضيف إلى رصيدك",dailyGiftPoints:"نقطة",day30Gift:"حصلت على الشارة الحصرية لإكمال 30 يوماً!",choose:"اختر طريقة اللعب",games:"الألعاب الشائعة",quiz:"اختبار الذكاء",quizSub:"فكّر بسرعة · 10 جولات",memory:"تحدي الذاكرة",memorySub:"درّب ذاكرتك",reaction:"اختبار السرعة",reactionSub:"اختبر سرعة استجابتك",puzzle:"لغز الأرقام",puzzleSub:"اكتشف الرقم الناقص",ad:"إعلان بسيط يساعدنا على إبقاء الألعاب مجانية. أعضاء VIP يتمتعون بإعلانات أقل.",vipTitle:"ارتقِ بمستوى لعبك",vipDesc:"تحديات حصرية ونقاط إضافية وإعلانات أقل.",vipBtn:"اكتشف VIP",community:"مجتمع اللاعبين",leader:"أفضل اللاعبين",home:"الرئيسية",gamesNav:"الألعاب",ranks:"الترتيب",profile:"حسابي",correct:"إجابة صحيحة! +10 نقاط",wrong:"ليست الإجابة الصحيحة، حاول مجدداً!",next:"السؤال التالي",done:"أحسنت اللعب!",close:"إغلاق",tapStart:"اضغط عندما يتحول اللون إلى الأخضر!",wait:"انتظر اللون الأخضر…",tapNow:"اضغط الآن!",tooSoon:"ضغطت مبكراً! حاول مجدداً.",yourTime:"زمن الاستجابة",playAgain:"العب مجدداً",moves:"المحاولات",vipInfo:"تشمل VIP أنماط لعب حصرية ونقاطاً إضافية وتجربة بإعلانات أقل. الدفع غير مفعّل في هذه النسخة التجريبية.",subscribe:"اشتراك VIP قريباً",memoryInfo:"اعثر على الأزواج المتطابقة. هذه نسخة تجريبية لتجربة اللعب.",puzzleInfo:"ما الرقم التالي؟",adLabel:"إعلان",adRewardBtn:"🎁 شاهد إعلاناً واحصل على 20 نقطة"}
};
let lang = "en";
let points = 120;
let quizIndex = 0;
let quizQueue = [];
const questions = [
 {q:"Which planet is known as the Red Planet?",a:["Venus","Mars","Jupiter"],correct:1,ar:"ما الكوكب المعروف بالكوكب الأحمر؟",opts:["الزهرة","المريخ","المشتري"],category:"science"},
 {q:"What is 12 × 8?",a:["86","96","108"],correct:1,ar:"كم يساوي ١٢ × ٨؟",opts:["٨٦","٩٦","١٠٨"],category:"math"},
 {q:"How many sides does a hexagon have?",a:["5","6","8"],correct:1,ar:"كم ضلعاً للشكل السداسي؟",opts:["٥","٦","٨"],category:"math"},
 {q:"Which is the largest ocean?",a:["Atlantic","Indian","Pacific"],correct:2,ar:"ما أكبر محيط في العالم؟",opts:["الأطلسي","الهندي","الهادئ"],category:"geography"},
 {q:"What gas do plants absorb?",a:["Oxygen","Carbon dioxide","Nitrogen"],correct:1,ar:"ما الغاز الذي تمتصه النباتات؟",opts:["الأكسجين","ثاني أكسيد الكربون","النيتروجين"],category:"science"},
 {q:"How many minutes are in 2 hours?",a:["100","120","140"],correct:1,ar:"كم دقيقة في ساعتين؟",opts:["١٠٠","١٢٠","١٤٠"],category:"math"},
 {q:"Which animal is the fastest on land?",a:["Lion","Cheetah","Horse"],correct:1,ar:"ما أسرع حيوان بري؟",opts:["الأسد","الفهد","الحصان"],category:"nature"},
 {q:"What is the capital of Japan?",a:["Seoul","Tokyo","Beijing"],correct:1,ar:"ما عاصمة اليابان؟",opts:["سيول","طوكيو","بكين"],category:"geography"},
 {q:"How many colors are in a rainbow?",a:["5","7","9"],correct:1,ar:"كم لوناً في قوس قزح؟",opts:["٥","٧","٩"],category:"science"},
 {q:"Which organ pumps blood?",a:["Lungs","Brain","Heart"],correct:2,ar:"أي عضو يضخ الدم؟",opts:["الرئتان","الدماغ","القلب"],category:"science"},
 {q:"What is 9 squared?",a:["18","72","81"],correct:2,ar:"كم يساوي ٩ تربيع؟",opts:["١٨","٧٢","٨١"],category:"math"},
 {q:"Which is a primary color of light?",a:["Green","Brown","Pink"],correct:0,ar:"أي مما يلي لون أساسي للضوء؟",opts:["الأخضر","البني","الوردي"],category:"science"},
 {q:"Which planet is famous for its rings?",a:["Saturn","Mercury","Earth"],correct:0,ar:"أي كوكب يشتهر بحلقاته؟",opts:["زحل","عطارد","الأرض"],category:"science"},
 {q:"What is the largest mammal?",a:["Elephant","Blue whale","Giraffe"],correct:1,ar:"ما أكبر الثدييات؟",opts:["الفيل","الحوت الأزرق","الزرافة"],category:"nature"},
 {q:"How many days are in a leap year?",a:["365","366","364"],correct:1,ar:"كم يوماً في السنة الكبيسة؟",opts:["٣٦٥","٣٦٦","٣٦٤"],category:"general"},
 {q:"Which continent is Egypt in?",a:["Asia","Africa","Europe"],correct:1,ar:"في أي قارة تقع مصر؟",opts:["آسيا","أفريقيا","أوروبا"],category:"geography"},
 {q:"What is the chemical symbol for water?",a:["CO2","H2O","O2"],correct:1,ar:"ما الرمز الكيميائي للماء؟",opts:["CO2","H2O","O2"],category:"science"},
 {q:"How many players are on a football team on the field?",a:["9","10","11"],correct:2,ar:"كم لاعباً في فريق كرة القدم داخل الملعب؟",opts:["٩","١٠","١١"],category:"sports"},
 {q:"Which instrument has keys, pedals and strings?",a:["Piano","Flute","Drum"],correct:0,ar:"أي آلة موسيقية لها مفاتيح ودواسات وأوتار؟",opts:["البيانو","الفلوت","الطبلة"],category:"arts"},
 {q:"What is the nearest star to Earth?",a:["Sirius","The Sun","Polaris"],correct:1,ar:"ما أقرب نجم إلى الأرض؟",opts:["الشعرى","الشمس","النجم القطبي"],category:"science"},
 {q:"Which country is shaped like a boot?",a:["Spain","Italy","Greece"],correct:1,ar:"أي دولة تشبه شكل الحذاء؟",opts:["إسبانيا","إيطاليا","اليونان"],category:"geography"},
 {q:"How many degrees are in a right angle?",a:["45","90","180"],correct:1,ar:"كم درجة في الزاوية القائمة؟",opts:["٤٥","٩٠","١٨٠"],category:"math"},
 {q:"Which language is primarily spoken in Brazil?",a:["Spanish","Portuguese","French"],correct:1,ar:"ما اللغة الأساسية في البرازيل؟",opts:["الإسبانية","البرتغالية","الفرنسية"],category:"geography"},
 {q:"What does CPU stand for?",a:["Central Processing Unit","Computer Power Utility","Core Program User"],correct:0,ar:"إلى ماذا يشير اختصار CPU؟",opts:["وحدة المعالجة المركزية","أداة طاقة الحاسوب","مستخدم البرنامج الأساسي"],category:"technology"},
 {q:"Which is the largest desert in the world?",a:["Sahara","Antarctic Desert","Gobi"],correct:1,ar:"ما أكبر صحراء في العالم؟",opts:["الصحراء الكبرى","صحراء القطب الجنوبي","غوبي"],category:"geography"},
 {q:"How many bones are in a typical adult human body?",a:["206","201","212"],correct:0,ar:"كم عدد عظام جسم الإنسان البالغ عادةً؟",opts:["٢٠٦","٢٠١","٢١٢"],category:"science"},
 {q:"Who wrote Romeo and Juliet?",a:["Charles Dickens","William Shakespeare","Jane Austen"],correct:1,ar:"من كتب روميو وجولييت؟",opts:["تشارلز ديكنز","ويليام شكسبير","جين أوستن"],category:"history"},
 {q:"Which sport uses a shuttlecock?",a:["Tennis","Badminton","Squash"],correct:1,ar:"أي رياضة تستخدم الريشة؟",opts:["التنس","الريشة الطائرة","الإسكواش"],category:"sports"},
 {q:"What is the square root of 144?",a:["10","12","14"],correct:1,ar:"ما الجذر التربيعي للعدد ١٤٤؟",opts:["١٠","١٢","١٤"],category:"math"},
 {q:"Which device measures temperature?",a:["Barometer","Thermometer","Compass"],correct:1,ar:"أي جهاز يقيس درجة الحرارة؟",opts:["البارومتر","مقياس الحرارة","البوصلة"],category:"science"},
 {q:"What is the capital of Australia?",a:["Sydney","Canberra","Melbourne"],correct:1,ar:"ما عاصمة أستراليا؟",opts:["سيدني","كانبيرا","ملبورن"],category:"geography"},
 {q:"Which blood cells help fight infection?",a:["Red cells","White cells","Platelets"],correct:1,ar:"أي خلايا الدم تساعد في مقاومة العدوى؟",opts:["الحمراء","البيضاء","الصفائح"],category:"science"},
 {q:"How many bits are in one byte?",a:["4","8","16"],correct:1,ar:"كم بتاً في البايت الواحد؟",opts:["٤","٨","١٦"],category:"technology"},
 {q:"Which metal is liquid at room temperature?",a:["Iron","Mercury","Copper"],correct:1,ar:"أي معدن يكون سائلاً في درجة حرارة الغرفة؟",opts:["الحديد","الزئبق","النحاس"],category:"science"},
 {q:"Which ancient wonder was in Egypt?",a:["Colossus of Rhodes","Great Pyramid of Giza","Hanging Gardens"],correct:1,ar:"أي عجائب الدنيا القديمة تقع في مصر؟",opts:["عملاق رودس","هرم الجيزة الأكبر","حدائق بابل"],category:"history"},
 {q:"What is the fastest bird in a dive?",a:["Eagle","Peregrine falcon","Owl"],correct:1,ar:"ما أسرع طائر عند الانقضاض؟",opts:["النسر","الصقر الشاهين","البومة"],category:"nature"},
 {q:"Which planet is closest to the Sun?",a:["Venus","Mercury","Mars"],correct:1,ar:"ما أقرب كوكب إلى الشمس؟",opts:["الزهرة","عطارد","المريخ"],category:"science"},
 {q:"How many sides does an octagon have?",a:["6","8","10"],correct:1,ar:"كم ضلعاً للشكل الثماني؟",opts:["٦","٨","١٠"],category:"math"},
 {q:"Which country gifted the Statue of Liberty to the USA?",a:["France","Canada","Italy"],correct:0,ar:"أي دولة أهدت تمثال الحرية للولايات المتحدة؟",opts:["فرنسا","كندا","إيطاليا"],category:"history"},
 {q:"What is the main gas in Earth's atmosphere?",a:["Oxygen","Nitrogen","Carbon dioxide"],correct:1,ar:"ما الغاز الأكثر وفرة في الغلاف الجوي للأرض؟",opts:["الأكسجين","النيتروجين","ثاني أكسيد الكربون"],category:"science"},
 {q:"Which app category does Python belong to?",a:["Programming language","Web browser","Operating system"],correct:0,ar:"إلى أي فئة تنتمي Python؟",opts:["لغة برمجة","متصفح ويب","نظام تشغيل"],category:"technology"},
 {q:"What is 15% of 200?",a:["20","30","40"],correct:1,ar:"كم يساوي ١٥٪ من ٢٠٠؟",opts:["٢٠","٣٠","٤٠"],category:"math"},
 {q:"Which sea separates Saudi Arabia and Africa?",a:["Red Sea","Arabian Sea","Mediterranean Sea"],correct:0,ar:"أي بحر يفصل السعودية عن أفريقيا؟",opts:["البحر الأحمر","بحر العرب","البحر المتوسط"],category:"geography"},
 {q:"Which animal is known for changing its color?",a:["Chameleon","Camel","Penguin"],correct:0,ar:"أي حيوان يشتهر بتغيير لونه؟",opts:["الحرباء","الجمل","البطريق"],category:"nature"},
 {q:"What is the process by which plants make food?",a:["Evaporation","Photosynthesis","Condensation"],correct:1,ar:"ما العملية التي تصنع بها النباتات غذاءها؟",opts:["التبخر","البناء الضوئي","التكاثف"],category:"science"},
 {q:"Which is the smallest prime number?",a:["0","1","2"],correct:2,ar:"ما أصغر عدد أولي؟",opts:["٠","١","٢"],category:"math"},
 {q:"What does WWW stand for?",a:["World Wide Web","Web World Wire","Wide Web Window"],correct:0,ar:"إلى ماذا يشير اختصار WWW؟",opts:["الشبكة العالمية","سلك عالم الويب","نافذة الويب الواسعة"],category:"technology"},
 {q:"In which sport is the term 'love' used for zero?",a:["Basketball","Tennis","Cricket"],correct:1,ar:"في أي رياضة تُستخدم كلمة Love للدلالة على الصفر؟",opts:["كرة السلة","التنس","الكريكيت"],category:"sports"},
 {q:"Which city is famous for the Eiffel Tower?",a:["Rome","Paris","Berlin"],correct:1,ar:"أي مدينة تشتهر ببرج إيفل؟",opts:["روما","باريس","برلين"],category:"geography"},
 {q:"What is the boiling point of water at sea level in Celsius?",a:["50","100","150"],correct:1,ar:"كم درجة غليان الماء عند سطح البحر؟",opts:["٥٠","١٠٠","١٥٠"],category:"science"},
 {q:"Which part of a computer stores data temporarily while running?",a:["RAM","SSD","Monitor"],correct:0,ar:"أي جزء يخزن البيانات مؤقتاً أثناء التشغيل؟",opts:["RAM","SSD","الشاشة"],category:"technology"}
];
const $ = id => document.getElementById(id);
function t(k){return translations[lang][k] || k}
function setLang(next){lang=next;document.documentElement.lang=lang;document.body.classList.toggle("rtl",lang==="ar");$("langBtn").textContent=lang==="en"?"العربية":"English";$("welcome").textContent=t("welcome");$("heroEyebrow").textContent=t("eyebrow");$("heroTitle").innerHTML=t("heroTitle");$("heroDesc").textContent=t("heroDesc");$("playNowText").textContent=t("playNow");$("pointsLabel").textContent=t("points");$("rankLabel").textContent=t("rank");$("streakLabel").textContent=t("streak");$("streakEyebrow").textContent=t("streakEyebrow");$("streakTitle").textContent=t("streakTitle");$("streakDaysText").textContent=t("streakDaysText");$("streakBestLabel").textContent=t("streakBestLabel");$("streakHint").textContent=t("streakHint");$("dailyRewardsTitle").textContent=t("dailyRewards");$("dailyRewardPlan").textContent=t("dailyRewardPlan");$("chooseLabel").textContent=t("choose");$("gamesTitle").textContent=t("games");$("adText").textContent=t("ad");$("vipTitle").textContent=t("vipTitle");$("vipDesc").textContent=t("vipDesc");$("vipBtn").firstChild.textContent=t("vipBtn")+" ";$("communityLabel").textContent=t("community");$("leaderTitle").textContent=t("leader");$("homeNav").textContent=t("home");$("gamesNavText").textContent=t("gamesNav");$("rankNavText").textContent=t("ranks");$("profileNavText").textContent=t("profile");document.querySelectorAll("[data-i18n]").forEach(el=>el.textContent=t(el.dataset.i18n));const adButton=$("rewardAdBtn");if(adButton)adButton.textContent=t("adRewardBtn");}
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
    await loadProfile();
    await loadLeaderboard();
    return true;
  } catch (error) {
    console.error("Score save failed:", error);
    const feedback = $("feedback") || $("puzzleFeedback");
    if (feedback) feedback.textContent = error.message;
    return false;
  }
}
async function showRewardedAd(){
  const button=$("rewardAdBtn"), feedback=$("adFeedback");
  if(!tg?.initData){if(feedback)feedback.textContent=lang==="ar"?"افتح اللعبة من تيليجرام أولاً.":"Open the game from Telegram first.";return;}
  if(document.body.classList.contains("vip-member"))return;
  if(!window.Adsgram){if(feedback)feedback.textContent=lang==="ar"?"تعذر تحميل خدمة الإعلانات. حاول لاحقاً.":"Ads service is unavailable. Please try again.";return;}
  if(!adsgramController){
    try{adsgramController=window.Adsgram.init({blockId:"59646"});}
    catch(error){console.error("AdsGram init failed",error);if(feedback)feedback.textContent=lang==="ar"?"تعذر تهيئة الإعلان.":"Could not initialize the ad.";return;}
  }
  button.disabled=true;
  if(feedback)feedback.textContent=lang==="ar"?"جارٍ تحميل الإعلان…":"Loading ad…";
  try{
    const result=await adsgramController.show();
    if(result?.done!==true)throw new Error("Ad was not completed.");
    const claimId=crypto.randomUUID();
    const response=await fetch("/api/adsgram/reward",{method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Init-Data":tg.initData},body:JSON.stringify({claimId})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Reward could not be saved.");
    points=data.points;$("points").textContent=points;await loadLeaderboard();
    if(feedback)feedback.textContent=lang==="ar"?`تمت إضافة ${data.awarded} نقطة إلى رصيدك!`:`+ ${data.awarded} points added to your balance!`;
  }catch(error){
    console.warn("Rewarded ad not completed or reward failed:",error);
    if(feedback)feedback.textContent=lang==="ar"?"لم تكتمل المشاهدة أو تعذر تسجيل المكافأة.":"Ad not completed or reward could not be saved.";
  }finally{button.disabled=false;}
}

function renderStreak(streak){
  if(!streak)return;
  const current=Number(streak.current||0),best=Number(streak.longest||0);
  $("streakValue").textContent=current;
  $("streakCount").textContent=current;
  $("streakBest").textContent=best;
  const weekdays=lang==="ar"?["أحد","إثن","ثلا","أرب","خمي","جمع","سبت"]:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const today=streak.today;
  const todayDate=new Date(today+"T00:00:00Z");
  const week=[];
  for(let offset=6;offset>=0;offset--){
    const d=new Date(todayDate.getTime()-offset*86400000);
    const key=d.toISOString().slice(0,10);
    const label=weekdays[d.getUTCDay()];
    const done=(streak.weekDays||[]).includes(key);
    week.push(`<div class="streak-day ${done?"done":""} ${key===today?"today":""}"><span>${label}</span><b>${done?"✓":key===today?"·":"—"}</b></div>`);
  }
  $("streakWeek").innerHTML=week.join("");
  $("streakHint").textContent=current===0
    ?(lang==="ar"?"ابدأ سلسلة جديدة اليوم بإكمال أي لعبة.":"Start a new streak today by completing any game.")
    :(lang==="ar"?`أكملت اللعب ${Number(streak.totalDays||0)} يوماً إجمالاً. استمر غداً!`:`You've played on ${Number(streak.totalDays||0)} days in total. Come back tomorrow!`);
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
    renderStreak(data.streak);
    if (data.dailyReward?.awarded > 0) {
      const giftText = data.dailyReward.giftCode === "30_day_legend_badge"
        ? (lang === "ar" ? "<p>🏅 حصلت على الشارة الحصرية لإكمال 30 يوماً متتالياً!</p>" : "<p>🏅 You unlocked the exclusive 30-day streak badge!</p>")
        : "";
      showModal(`<h2>🎁 ${lang === "ar" ? "هدية الدخول اليومية!" : "Daily login gift!"}</h2><div class="big-number">+${Number(data.dailyReward.awarded)} ⭐</div><p class="muted">${lang === "ar" ? "تمت إضافة النقاط إلى رصيدك." : "Points have been added to your balance."}</p>${giftText}<button class="game-action" id="dailyGiftOk">${lang === "ar" ? "رائع!" : "Awesome!"}</button>`);
      $("dailyGiftOk").onclick=closeModal;
    }
    if (data.firstName) $("welcome").textContent = "Hi, " + data.firstName + "!";
  } catch (error) {
    console.error("Profile load failed:", error);
    $("points").textContent = "—";
  }
}
function startQuiz(){quizIndex=0;quizQueue=[...questions].sort(()=>Math.random()-.5).slice(0,10);renderQuestion()}
function renderQuestion(){const q=quizQueue[quizIndex];const prompt=lang==="en"?q.q:q.ar;const opts=lang==="en"?q.a:q.opts;showModal(`<h2>🧠 ${t("quiz")}</h2><p class="muted">${quizIndex+1} / 10</p><h3>${prompt}</h3>${opts.map((x,i)=>`<button class="answer" data-answer="${i}">${x}</button>`).join("")}<p id="feedback" class="muted"></p>`);document.querySelectorAll("[data-answer]").forEach(b=>b.onclick=async()=>{if(b.disabled)return;document.querySelectorAll("[data-answer]").forEach(x=>x.disabled=true);const ok=Number(b.dataset.answer)===q.correct;if(ok){await addPoints("quiz_correct");$("feedback").textContent=t("correct")}else{$("feedback").textContent=t("wrong")}setTimeout(()=>{quizIndex++;if(quizIndex>=10){showModal(`<h2>🏆 ${t("done")}</h2><p class="muted">${lang==="en"?"Your points":"نقاطك"}: ${points}</p><button class="game-action" id="again">${t("playAgain")}</button>`);$("again").onclick=startQuiz}else renderQuestion()},650)})}
function startMemory(){const icons=["🍋","🍇","🍉","🍒","🍋","🍇","🍉","🍒"].sort(()=>Math.random()-.5);let open=[],matched=0,moves=0,locked=false;showModal(`<h2>🧩 ${t("memory")}</h2><p class="muted">${t("memoryInfo")}</p><p class="muted">${t("moves")}: <b id="moves">0</b></p><div class="memory-grid">${icons.map((_,i)=>`<button class="answer mem" data-i="${i}">❔</button>`).join("")}</div>`);document.querySelectorAll(".mem").forEach(b=>b.onclick=async()=>{const i=+b.dataset.i;if(locked||b.disabled||open.some(x=>x.i===i))return;b.textContent=icons[i];open.push({i,icon:icons[i],el:b});if(open.length===2){locked=true;moves++;$("moves").textContent=moves;const pair=open[0].icon===open[1].icon;if(pair){open.forEach(x=>{x.el.disabled=true;x.el.textContent=x.icon});matched+=2;if(matched===8){await addPoints("memory_complete");setTimeout(()=>showModal(`<h2>🎉 ${t("done")}</h2><p>${t("moves")}: ${moves}</p><p>${t("correct")}</p>`),350)}}else{const pairNow=[...open];setTimeout(()=>{pairNow.forEach(x=>x.el.textContent="❔");locked=false},650)}if(pair)locked=false;open=[]}})}
function startReaction(){showModal(`<h2>⚡ ${t("reaction")}</h2><p class="muted">${t("tapStart")}</p><button class="game-action" id="reactionArea">${t("wait")}</button>`);let ready=false,started=0,timer;const area=$("reactionArea");const delay=1200+Math.random()*2500;timer=setTimeout(()=>{ready=true;started=performance.now();area.textContent=t("tapNow");area.style.background="#16a36b"},delay);area.onclick=async()=>{if(!ready){clearTimeout(timer);area.textContent=t("tooSoon");setTimeout(startReaction,900);return}const ms=Math.round(performance.now()-started);if(ms<500)await addPoints("reaction_fast");showModal(`<h2>⚡ ${t("yourTime")}</h2><div class="big-number">${ms} ms</div><p class="muted">${ms<250?"Lightning fast!":ms<400?"Great reflexes!":"Keep practicing!"}</p><button class="game-action" id="again">${t("playAgain")}</button>`);$("again").onclick=startReaction}}
function startPuzzle(){showModal(`<h2>🔢 ${t("puzzle")}</h2><p>${t("puzzleInfo")}</p><div class="big-number">2 · 4 · 8 · 16 · ?</div>${[20,24,32,36].map(n=>`<button class="answer" data-num="${n}">${n}</button>`).join("")}<p id="puzzleFeedback" class="muted"></p>`);document.querySelectorAll("[data-num]").forEach(b=>b.onclick=async()=>{if(b.disabled)return;if(+b.dataset.num===32){document.querySelectorAll("[data-num]").forEach(x=>x.disabled=true);$("puzzleFeedback").textContent=t("correct");await addPoints("puzzle_correct")}else $("puzzleFeedback").textContent=t("wrong")})}
function startWord(){const rounds=[{word:"PLANET",scramble:"T E N A P L",hint:"A world orbiting a star",ar:"كوكب يدور حول نجم"},{word:"OCEAN",scramble:"N C E O A",hint:"A very large body of salt water",ar:"مسطح مائي مالح واسع"},{word:"HEART",scramble:"R A E H T",hint:"It pumps blood",ar:"يضخ الدم في الجسم"},{word:"APPLE",scramble:"P L E A P",hint:"A common fruit",ar:"فاكهة مشهورة"}];let index=0;function show(){const item=rounds[index];showModal(`<h2>🔤 ${lang==="en"?"Word Scramble":"رتّب الحروف"}</h2><p class="muted">${lang==="en"?"Unscramble the letters":"رتّب الحروف لتكوين الكلمة"} · ${index+1}/${rounds.length}</p><div class="big-number">${item.scramble}</div><p class="muted">${lang==="en"?item.hint:item.ar}</p><input id="wordGuess" class="answer" autocomplete="off" placeholder="${lang==="en"?"Your answer":"إجابتك"}"><p id="wordFeedback" class="muted"></p><button class="game-action" id="wordSubmit">${lang==="en"?"Check answer":"تحقق من الإجابة"}</button>`);$("wordSubmit").onclick=async()=>{const guess=$("wordGuess").value.trim().toUpperCase();if(guess===item.word){$("wordSubmit").disabled=true;await addPoints("word_correct");index++;if(index===rounds.length)showModal(`<h2>🏆 ${t("done")}</h2><p>${lang==="en"?"You solved all words!":"أكملت جميع الكلمات!"}</p>`);else show()}else $("wordFeedback").textContent=lang==="en"?"Not quite. Try again!":"ليست صحيحة، حاول مجدداً";};}show()}
async function loadLeaderboard(){const box=$("leaderboardRows");if(!box)return;try{const response=await fetch("/api/leaderboard",{headers:{"X-Telegram-Init-Data":tg?.initData || ""}});const data=await response.json();if(!response.ok)throw new Error("Leaderboard unavailable");box.innerHTML=data.players.length?data.players.map((p,i)=>`<div class="player"><span class="place ${i===0?"gold":i===1?"silver":i===2?"bronze":""}">${i+1}</span><span class="avatar">${["🏆","🎮","⭐","🚀","🧠"][i%5]}</span><b>${escapeHtml(p.name||"Player")}</b><strong>${Number(p.points).toLocaleString()}</strong></div>`).join(""):`<p class="muted">${lang==="en"?"Be the first to score!":"كن أول من يجمع النقاط!"}</p>`;const me=data.players.findIndex(p=>p.isMe);$("rankValue").textContent=me>=0?"#"+(me+1):"—";}catch(e){box.innerHTML='<p class="muted">Could not load rankings.</p>';}}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function openVip(){
  const isAr=lang==="ar";
  let membership={active:false,expiresAt:null,priceStars:100,periodDays:30};
  if(tg?.initData){
    try{
      const response=await fetch("/api/vip",{headers:{"X-Telegram-Init-Data":tg.initData}});
      if(response.ok) membership=await response.json();
    }catch(error){console.warn("VIP status unavailable",error);}
  }
  const expiry=membership.expiresAt?new Date(membership.expiresAt).toLocaleDateString(isAr?"ar-SA":"en-US"):"";
  showModal(`<div class="vip-modal">
    <span class="vip-tag">⭐ VIP CLUB</span>
    <h2>${isAr?"ارتقِ بتجربتك في Gaming Hub":"Unlock more from Gaming Hub"}</h2>
    <p class="muted">${isAr?"عضوية تمنحك مزايا إضافية وتجربة لعب مميزة.":"A more rewarding way to play, with exclusive member benefits."}</p>
    <div class="vip-benefits">
      <p>⭐ ${isAr?"نقاط إضافية بنسبة ٥٠٪ في كل لعبة":"50% extra points in every game"}</p>
      <p>🎁 ${isAr?"شارة VIP ومكافآت خاصة":"VIP member badge and special rewards"}</p>
      <p>🚫 ${isAr?"إعلانات أقل":"Fewer advertisements"}</p>
      <p>🌟 ${isAr?"شارة العضوية المميزة":"VIP member status"}</p>
    </div>
    ${membership.active?`<div class="vip-status">✓ ${isAr?"عضويتك فعّالة حتى":"Your membership is active until"} ${expiry}</div>
      <p class="muted">${isAr?"تتم إدارة التجديد من إعدادات اشتراكات تيليجرام.":"Manage renewal from your Telegram subscription settings."}</p>`:
      `<div class="vip-price"><strong>100 ⭐</strong><span>/ ${isAr?"كل 30 يوماً":"every 30 days"}</span></div>
      <p class="muted">${isAr?"الدفع عبر Telegram Stars. يتجدد الاشتراك تلقائياً كل 30 يوماً ويمكنك إلغاء التجديد من تيليجرام.":"Pay with Telegram Stars. Renews automatically every 30 days; you can cancel renewal in Telegram."}</p>
      <button class="game-action vip-pay" id="vipPay">${isAr?"اشترك الآن · 100 ⭐":"Subscribe now · 100 ⭐"}</button>`}
    <button class="vip-secondary" id="vipClose">${isAr?"إغلاق":"Close"}</button>
  </div>`);
  $("vipClose").onclick=closeModal;
  const pay=$("vipPay");
  if(pay) pay.onclick=async()=>{
    if(!tg?.initData||!tg?.openInvoice){
      pay.textContent=isAr?"افتح اللعبة من تيليجرام لإتمام الدفع":"Open Gaming Hub inside Telegram to pay";
      return;
    }
    pay.disabled=true;pay.textContent=isAr?"جارٍ تجهيز الفاتورة…":"Preparing secure invoice…";
    try{
      const response=await fetch("/api/vip/invoice",{method:"POST",headers:{"X-Telegram-Init-Data":tg.initData}});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Invoice unavailable");
      tg.openInvoice(data.invoiceLink,async(status)=>{
        if(status==="paid"){
          pay.textContent=isAr?"تم الدفع، جارٍ تحديث العضوية…":"Payment received, refreshing membership…";
          for(let attempt=0;attempt<5;attempt++){
            await new Promise(resolve=>setTimeout(resolve,700));
            const check=await fetch("/api/vip",{headers:{"X-Telegram-Init-Data":tg.initData}});
            if(check.ok){const vip=await check.json();if(vip.active)break;}
          }
          await openVip();
        }else{
          pay.disabled=false;pay.textContent=isAr?"اشترك الآن · 100 ⭐":"Subscribe now · 100 ⭐";
          if(status==="failed")alert(isAr?"تعذر إتمام الدفع. حاول مجدداً.":"Payment failed. Please try again.");
        }
      });
    }catch(error){
      pay.disabled=false;pay.textContent=isAr?"حاول مرة أخرى":"Try again";
      alert(error.message);
    }
  };
}

const balootCards=[{n:"7",v:1},{n:"8",v:2},{n:"9",v:3},{n:"J",v:4},{n:"Q",v:5},{n:"K",v:6},{n:"10",v:7},{n:"A",v:8}];
const balootSuits=["♠","♥","♦","♣"];
let balootStage=1,balootInventory=[];
async function balootStatus(){
 const r=await fetch("/api/baloot/status",{headers:{"X-Telegram-Init-Data":tg?.initData||""}});
 if(!r.ok)throw new Error("Open the game from Telegram first.");
 return r.json();
}
async function openBaloot(){
 try{
  const data=await balootStatus();balootStage=data.stage;balootInventory=data.inventory||[];
  showBalootLobby(data.points);
 }catch(e){showModal("<h2>🃏 Baloot</h2><p class='muted'>"+escapeHtml(e.message)+"</p>");}
}
function showBalootLobby(balance){
 const ar=lang==="ar";
 showModal(`<div class="baloot-screen"><div class="baloot-top"><span>🃏 BALOOT ARENA</span><span>🪙 ${balance??points}</span></div><h2>${ar?"تحدي البلوت":"Baloot Challenge"}</h2><p class="muted">${ar?"تدرّج في المراحل، اجمع الهدايا وافتح عناصر جديدة.":"Win card duels, clear stages, collect gifts and unlock new looks."}</p><div class="baloot-stage"><small>${ar?"المرحلة الحالية":"CURRENT STAGE"}</small><strong>${Math.min(20,balootStage)} / 20</strong><div class="stage-track"><i style="width:${Math.min(100,balootStage/20*100)}%"></i></div></div><div class="baloot-reward">🎁 ${balootStage>20?(ar?"أكملت جميع المراحل! أنت بطل البلوت 👑":"All stages cleared! You are a Baloot champion 👑"):(ar?"مكافأة اجتياز المرحلة: 25 نقطة":"Stage reward: 25 points")}</div>${balootStage>20?"":`<button class="game-action" id="balootPlay">${ar?"ابدأ المرحلة":"Play stage"} · ${balootStage}</button>`} <button class="game-action" id="balootMulti">👥 ${ar?"العب مع الأصدقاء":"Play with friends"}</button><button class="answer" id="balootShop">${ar?"🛍️ متجر البلوت":"🛍️ Baloot shop"}</button><div class="baloot-owned">${ar?"مقتنياتك":"Your collection"}: ${balootInventory.length?balootInventory.join(" · "):(ar?"لا توجد عناصر بعد":"No items yet")}</div></div>`);
 $("balootPlay").onclick=()=>startBalootStage();
 $("balootMulti").onclick=()=>window.BalootMultiplayer?.open();
 $("balootShop").onclick=()=>openBalootShop();
}
function startBalootStage(){
 let hand=Array.from({length:5},()=>({...balootCards[Math.floor(Math.random()*balootCards.length)],s:balootSuits[Math.floor(Math.random()*4)]}));
 let wins=0,round=0,locked=false;
 function render(){
  showModal(`<div class="baloot-screen"><div class="baloot-top"><span>🃏 STAGE ${balootStage}</span><span>${round}/5</span></div><h2>${lang==="ar"?"اختر ورقتك":"Choose your card"}</h2><p class="muted">${lang==="ar"?"الفوز بالجولة يكون بالورقة الأعلى قيمة.":"Play the higher card to win the trick."}</p><div class="baloot-score">${lang==="ar"?"انتصاراتك":"Your wins"} <b>${wins}</b> / 5</div><div class="baloot-hand">${hand.map((c,i)=>`<button class="playing-card ${["♥","♦"].includes(c.s)?"red-card":""}" data-card="${i}"><small>${c.n}</small><strong>${c.s}</strong></button>`).join("")}</div><p id="balootFeedback" class="muted">${lang==="ar"?"اختر ورقة للعب":"Tap a card to play"}</p></div>`);
  document.querySelectorAll("[data-card]").forEach(b=>b.onclick=async()=>{
   if(locked)return;locked=true;
   const idx=Number(b.dataset.card),chosen=hand.splice(idx,1)[0],ai=balootCards[Math.floor(Math.random()*balootCards.length)];
   const won=chosen.v>=ai.v;if(won)wins++;round++;
   const fb=$("balootFeedback");if(fb)fb.textContent=(lang==="ar"?"ورقتك ":"Your card ")+chosen.n+chosen.s+" · "+(lang==="ar"?"الخصم ":"Opponent ")+ai.n+(won?(lang==="ar"?" — فزت بالجولة!":" — You won the trick!"):(lang==="ar"?" — خسرْت الجولة":" — Opponent wins"));
   if(round===5){
    setTimeout(async()=>{
     if(wins>=3){
      try{const r=await fetch("/api/baloot/complete",{method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Init-Data":tg?.initData||""},body:JSON.stringify({stage:balootStage})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not save stage");points=d.points;$("points").textContent=points;balootStage=d.stage;await loadLeaderboard();showModal(`<div class="baloot-screen"><h2>🏆 ${lang==="ar"?"اجتزت المرحلة!":"Stage cleared!"}</h2><div class="big-number">🎁 +25</div><p>${lang==="ar"?"أحسنت! حصلت على 25 نقطة.":"Great play! You earned 25 points."}</p><button class="game-action" id="balootNext">${lang==="ar"?"المرحلة التالية":"Next stage"}</button></div>`);$("balootNext").onclick=openBaloot;
      }catch(e){showModal("<h2>⚠️</h2><p>"+escapeHtml(e.message)+"</p><button class='answer' id='backBaloot'>Back</button>");$("backBaloot").onclick=openBaloot;}
     }else{showModal(`<div class="baloot-screen"><h2>${lang==="ar"?"حاول مرة أخرى":"Try again"}</h2><p>${lang==="ar"?"تحتاج للفوز بثلاث جولات على الأقل.":"Win at least 3 of 5 tricks to clear this stage."}</p><button class="game-action" id="balootRetry">${lang==="ar"?"أعد المرحلة":"Retry stage"}</button></div>`);$("balootRetry").onclick=startBalootStage;}
    },650);
   }else{setTimeout(render,700);}
  });
 }
 render();
}
async function openBalootShop(){
 const items=[{id:"felt_green",name:"Green felt table",ar:"طاولة مخملية خضراء",cost:100,icon:"🟩"},{id:"gold_deck",name:"Golden card deck",ar:"أوراق ذهبية",cost:250,icon:"✨"},{id:"royal_frame",name:"Royal avatar frame",ar:"إطار ملكي للصورة",cost:400,icon:"👑"},{id:"desert_table",name:"Desert night table",ar:"طاولة ليلة الصحراء",cost:600,icon:"🌙"}];
 const data=await balootStatus();balootInventory=data.inventory||[];
 showModal(`<div class="baloot-screen"><h2>🛍️ ${lang==="ar"?"متجر البلوت":"Baloot shop"}</h2><p class="muted">${lang==="ar"?"اشترِ العناصر باستخدام نقاطك المكتسبة.":"Spend your earned game points on cosmetic items."} · 🪙 ${data.points}</p>${items.map(it=>`<div class="shop-item"><span class="shop-icon">${it.icon}</span><span><b>${lang==="ar"?it.ar:it.name}</b><small>${it.cost} points</small></span><button class="shop-buy" data-buy="${it.id}" ${balootInventory.includes(it.id)?"disabled":""}>${balootInventory.includes(it.id)?(lang==="ar"?"مملوك":"Owned"):(lang==="ar"?"شراء":"Buy")}</button></div>`).join("")}<button class="answer" id="shopBack">${lang==="ar"?"رجوع":"Back"}</button></div>`);
 document.querySelectorAll("[data-buy]").forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await fetch("/api/baloot/shop",{method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Init-Data":tg?.initData||""},body:JSON.stringify({item:b.dataset.buy})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Purchase failed");points=d.points;$("points").textContent=points;balootInventory=d.inventory;openBalootShop();}catch(e){alert(e.message);b.disabled=false;}});
 $("shopBack").onclick=openBaloot;
}
document.querySelectorAll("[data-game]").forEach(b=>b.onclick=()=>({quiz:startQuiz,memory:startMemory,reaction:startReaction,puzzle:startPuzzle,word:startWord,baloot:openBaloot}[b.dataset.game])());
$("langBtn").onclick=()=>setLang(lang==="en"?"ar":"en");
$("rewardAdBtn").onclick=showRewardedAd;
$("playNow").onclick=()=>startQuiz();
$("vipBtn").addEventListener("click", event=>{event.preventDefault();openVip();});
$("closeModal").onclick=closeModal;
$("gameModal").onclick=e=>{if(e.target===$("gameModal"))closeModal()};
$("gamesNav").onclick=()=>document.getElementById("gamesGrid").scrollIntoView({behavior:"smooth"});
$("rankNav").onclick=()=>document.querySelector(".leaderboard").scrollIntoView({behavior:"smooth"});
$("profileNav").onclick=()=>showModal(`<h2>👤 ${t("profile")}</h2><p class="muted">${lang==="en"?"Player":"اللاعب"}: ${tg?.initDataUnsafe?.user?.first_name || "Guest"}</p><p>${t("points")}: <b>${points}</b></p>`);
async function loadVipStatus(){
  if(!tg?.initData)return;
  try{
    const response=await fetch("/api/vip",{headers:{"X-Telegram-Init-Data":tg.initData}});
    if(!response.ok)return;
    const data=await response.json();
    document.body.classList.toggle("vip-member",Boolean(data.active));
    const ad=document.querySelector(".ad-slot");
    if(ad)ad.hidden=Boolean(data.active);
  }catch(error){console.warn("VIP status check failed",error);}
}
setLang("en");
loadProfile();
loadLeaderboard();
loadVipStatus();
if(tg?.initDataUnsafe?.user?.first_name){$("welcome").textContent=`Hi, ${tg.initDataUnsafe.user.first_name}!`;}
