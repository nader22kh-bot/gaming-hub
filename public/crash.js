(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const isArabic = () => (document.documentElement.lang || "").toLowerCase().startsWith("ar");
  const tr = (en, ar) => isArabic() ? ar : en;

  function openModal() {
    const content = byId("gameContent");
    const modal = byId("gameModal");
    if (!content || !modal) throw new Error("Game window is unavailable");
    content.innerHTML = `
      <section class="crash-game" dir="${isArabic() ? "rtl" : "ltr"}">
        <header class="crash-top"><strong>🚀 CRASH ARENA</strong><span class="crash-live">● SERVER ROUND</span></header>
        <p class="muted">${tr("Watch the multiplier rise. Cash out before the crash!","راقب ارتفاع المعامل واسحب قبل الانفجار!")}</p>
        <div class="crash-stage" id="crashStage">
          <div class="crash-stars">✦　·　✧　·　✦　·　✧</div>
          <div class="crash-trail" id="crashTrail"></div>
          <div class="crash-rocket" id="crashRocket">🚀</div>
          <div class="crash-multiplier" id="crashMultiplier">1.00x</div>
          <div class="crash-status" id="crashStatus">${tr("Ready for takeoff?","هل أنت مستعد للإقلاع؟")}</div>
          <div class="crash-progress"><span id="crashProgress"></span></div>
        </div>
        <div class="crash-controls">
          <button type="button" class="game-action" id="crashStart">${tr("🚀 START ROUND","🚀 ابدأ الجولة")}</button>
          <button type="button" class="game-action crash-cashout" id="crashCashout" disabled>${tr("💰 CASH OUT","💰 اسحب النقاط")}</button>
        </div>
        <div class="crash-stats">
          <div><small>${tr("LAST ROUND","الجولة السابقة")}</small><b id="crashLast">—</b></div>
          <div><small>${tr("PERSONAL BEST","أفضل معامل")}</small><b id="crashBest">1.00x</b></div>
          <div><small>${tr("REWARD","المكافأة")}</small><b id="crashReward">0 ⭐</b></div>
        </div>
        <p class="muted crash-note">${tr("Virtual points only. No cash or deposits. Successful cash-out: 10 points (15 for VIP), maximum 10 rewards per day.","نقاط افتراضية فقط، دون أموال أو إيداعات. السحب الناجح يمنح 10 نقاط (15 للـVIP)، بحد أقصى 10 مكافآت يومياً.")}</p>
      </section>`;
    modal.classList.remove("hidden");
  }

  async function requestJson(url, body) {
    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": initData || ""
      },
      body: JSON.stringify(body || {})
    });
    let data;
    try { data = await response.json(); }
    catch (_) { throw new Error("The server returned an invalid response."); }
    if (!response.ok) throw new Error(data && data.error ? data.error : "Request failed (" + response.status + ")");
    return data;
  }

  function startCrashGame() {
    openModal();

    let intervalId = null;
    let active = false;
    let roundId = null;
    let crashAt = 0;
    let startedAt = 0;
    let multiplierValue = 1;
    let bestValue = 1;

    const startButton = byId("crashStart");
    const cashButton = byId("crashCashout");
    const stage = byId("crashStage");
    const rocket = byId("crashRocket");
    const multiplier = byId("crashMultiplier");
    const status = byId("crashStatus");
    const trail = byId("crashTrail");
    const progress = byId("crashProgress");

    function stopTimer() {
      if (intervalId !== null) window.clearInterval(intervalId);
      intervalId = null;
      active = false;
      cashButton.disabled = true;
      startButton.disabled = false;
    }

    function finishAsCrash() {
      if (!active) return;
      stopTimer();
      stage.classList.add("crashed");
      rocket.textContent = "💥";
      trail.style.opacity = "0";
      status.textContent = tr("CRASHED! Try another round.","انفجر الصاروخ! حاول في جولة أخرى.");
      byId("crashLast").textContent = multiplierValue.toFixed(2) + "x";
    }

    startButton.addEventListener("click", async () => {
      if (active || startButton.disabled) return;
      startButton.disabled = true;
      status.textContent = tr("Preparing a verified round…","جارٍ تجهيز جولة موثوقة…");
      try {
        const result = await requestJson("/api/crash/start");
        if (!result || !result.roundId || !Number.isFinite(Number(result.crashAt))) {
          throw new Error("The server did not return valid round data.");
        }
        roundId = result.roundId;
        crashAt = Number(result.crashAt);
        startedAt = Date.now();
        multiplierValue = 1;
        active = true;
        stage.classList.remove("crashed", "cashed");
        rocket.textContent = "🚀";
        rocket.style.transform = "translateY(0) rotate(0)";
        trail.style.opacity = "1";
        trail.style.height = "0px";
        progress.style.width = "0%";
        multiplier.textContent = "1.00x";
        status.textContent = tr("Flying… cash out anytime!","الصاروخ يرتفع… اسحب في أي وقت!");
        cashButton.disabled = false;

        intervalId = window.setInterval(() => {
          const elapsed = (Date.now() - startedAt) / 1000;
          multiplierValue = Math.exp(elapsed * 0.19);
          multiplier.textContent = multiplierValue.toFixed(2) + "x";
          const rise = Math.min(125, elapsed * 18);
          rocket.style.transform = "translateY(-" + rise + "px) rotate(-13deg)";
          trail.style.height = Math.min(115, elapsed * 18) + "px";
          progress.style.width = Math.min(100, (multiplierValue / crashAt) * 100) + "%";
          if (multiplierValue >= crashAt) finishAsCrash();
        }, 50);
      } catch (error) {
        status.textContent = error && error.message ? error.message : tr("Could not start the round.","تعذر بدء الجولة.");
        startButton.disabled = false;
      }
    });

    cashButton.addEventListener("click", async () => {
      if (!active || !roundId || cashButton.disabled) return;
      const currentRoundId = roundId;
      cashButton.disabled = true;
      status.textContent = tr("Verifying your cash-out…","جارٍ التحقق من السحب…");
      try {
        const result = await requestJson("/api/crash/cashout", { roundId: currentRoundId });
        stopTimer();
        multiplierValue = Number(result.factor) || multiplierValue;
        multiplier.textContent = multiplierValue.toFixed(2) + "x";
        byId("crashReward").textContent = "+" + Number(result.awarded || 0) + " ⭐";
        byId("crashLast").textContent = multiplierValue.toFixed(2) + "x";
        bestValue = Math.max(bestValue, multiplierValue);
        byId("crashBest").textContent = bestValue.toFixed(2) + "x";
        stage.classList.add("cashed");
        status.textContent = tr("CASHED OUT! Points saved.","تم السحب وحُفظت النقاط بنجاح.");
        if (typeof window.refreshGamingHub === "function") {
          await window.refreshGamingHub(result.points);
        }
      } catch (error) {
        stopTimer();
        stage.classList.add("crashed");
        rocket.textContent = "💥";
        status.textContent = error && error.message ? error.message : tr("Cash-out failed.","تعذر حفظ السحب.");
        byId("crashLast").textContent = multiplierValue.toFixed(2) + "x";
      }
    });
  }

  window.startCrashGame = startCrashGame;
})();