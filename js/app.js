/**
 * 毛森禮研所 MoriPaw Atelier 主程式
 * 嚴格遵守 AGENTS.md：純原生 JS、所有商品與使用者文字均使用 textContent 渲染、支援完整鍵盤操作。
 */

(function () {
  "use strict";

  const DATA = window.MORIPAW_DATA;
  if (!DATA) return;

  const STORAGE_KEY = "moripaw_preorder_v1";

  // 狀態集中管理
  const state = {
    activeCategory: "全部",
    searchQuery: "",
    cart: loadCartFromStorage(), // [{ id, qty }]
    activeModalProductId: null,
    lastFocusedElement: null,
    isCampaignExpired: false
  };

  // DOM 參照
  const dom = {
    navToggle: document.getElementById("nav-toggle"),
    primaryNav: document.getElementById("primary-nav"),
    navCartCount: document.getElementById("nav-cart-count"),

    campaignBadge: document.getElementById("campaign-badge"),
    campaignTitle: document.getElementById("campaign-title"),
    campaignDesc: document.getElementById("campaign-desc"),
    promoCodeDisplay: document.getElementById("promo-code-display"),
    copyPromoBtn: document.getElementById("copy-promo-btn"),
    promoCopyFeedback: document.getElementById("promo-copy-feedback"),
    campaignStatus: document.getElementById("campaign-status"),
    campaignDeadlineText: document.getElementById("campaign-deadline-text"),
    cdDays: document.getElementById("cd-days"),
    cdHours: document.getElementById("cd-hours"),
    cdMinutes: document.getElementById("cd-minutes"),
    cdSeconds: document.getElementById("cd-seconds"),

    categoryFilters: document.getElementById("category-filters"),
    productSearch: document.getElementById("product-search"),
    clearSearchBtn: document.getElementById("clear-search-btn"),
    catalogStatus: document.getElementById("catalog-status"),
    productGrid: document.getElementById("product-grid"),
    catalogEmpty: document.getElementById("catalog-empty"),
    resetFiltersBtn: document.getElementById("reset-filters-btn"),

    reviewsGrid: document.getElementById("reviews-grid"),
    faqList: document.getElementById("faq-list"),

    cartEmpty: document.getElementById("cart-empty"),
    cartList: document.getElementById("cart-list"),
    clearCartBtn: document.getElementById("clear-cart-btn"),
    applyPromoCheckbox: document.getElementById("apply-campaign-promo"),
    applyPromoLabel: document.getElementById("apply-promo-label"),
    cartPromoState: document.getElementById("cart-promo-state"),
    summarySubtotal: document.getElementById("summary-subtotal"),
    summaryDiscount: document.getElementById("summary-discount"),
    summaryTotal: document.getElementById("summary-total"),

    preorderForm: document.getElementById("preorder-form"),
    customerNickname: document.getElementById("customer-nickname"),
    customerNote: document.getElementById("customer-note"),
    preorderFeedback: document.getElementById("preorder-feedback"),
    copyOrderBtn: document.getElementById("copy-order-btn"),
    downloadOrderBtn: document.getElementById("download-order-btn"),
    orderPreviewText: document.getElementById("order-preview-text"),

    modal: document.getElementById("product-modal"),
    modalDialog: document.getElementById("modal-dialog"),
    modalCloseX: document.getElementById("modal-close-x"),
    modalCloseBtn: document.getElementById("modal-close-btn"),
    modalAddBtn: document.getElementById("modal-add-btn"),
    modalImage: document.getElementById("modal-image"),
    modalCategory: document.getElementById("modal-category"),
    modalTitle: document.getElementById("modal-title"),
    modalPrice: document.getElementById("modal-price"),
    modalTarget: document.getElementById("modal-target"),
    modalFullDesc: document.getElementById("modal-full-desc"),
    modalSafetyNote: document.getElementById("modal-safety-note"),

    toast: document.getElementById("toast")
  };

  let toastTimer = null;

  /* --------------------------------------------------------------------------
     工具函式
     -------------------------------------------------------------------------- */
  function formatCurrency(amount) {
    return "NT$ " + Number(amount).toLocaleString("zh-TW");
  }

  function findProductById(id) {
    return DATA.products.find(function (item) {
      return item.id === id;
    }) || null;
  }

  function loadCartFromStorage() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (entry) {
        return (
          entry &&
          typeof entry.id === "string" &&
          Number.isInteger(entry.qty) &&
          entry.qty > 0 &&
          Boolean(findProductById(entry.id))
        );
      });
    } catch (err) {
      return [];
    }
  }

  function saveCartToStorage() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
    } catch (err) {
      // 瀏覽器隱私模式不支援寫入時忽略
    }
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      dom.toast.hidden = true;
    }, 2400);
  }

  async function copyTextSafe(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // 退回傳統複製方式
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(textarea);
    return ok;
  }

  /* --------------------------------------------------------------------------
     手機版導覽列開關與鍵盤操作
     -------------------------------------------------------------------------- */
  function setNavOpen(isOpen) {
    dom.primaryNav.classList.toggle("is-open", isOpen);
    dom.navToggle.setAttribute("aria-expanded", String(isOpen));
    dom.navToggle.setAttribute("aria-label", isOpen ? "關閉導覽選單" : "開啟導覽選單");
  }

  function initNavigation() {
    dom.navToggle.addEventListener("click", function () {
      const expanded = dom.navToggle.getAttribute("aria-expanded") === "true";
      setNavOpen(!expanded);
    });

    dom.primaryNav.addEventListener("click", function (event) {
      if (event.target.closest("a.nav-link")) {
        setNavOpen(false);
      }
    });
  }

  /* --------------------------------------------------------------------------
     限時活動倒數（固定 +08:00 時區）與優惠碼複製
     -------------------------------------------------------------------------- */
  function padTwo(num) {
    return String(num).padStart(2, "0");
  }

  function initCampaign() {
    const campaign = DATA.campaign;
    dom.campaignBadge.textContent = campaign.badge;
    dom.campaignTitle.textContent = campaign.title;
    dom.campaignDesc.textContent = campaign.description;
    dom.promoCodeDisplay.textContent = campaign.promoCode;
    dom.applyPromoLabel.textContent = "套用限時優惠碼 " + campaign.promoCode + "（" + campaign.discountText + "）";

    const endMs = Date.parse(campaign.endTime);
    dom.campaignDeadlineText.textContent = "活動截止時間：" + campaign.endTime.replace("T", " ").replace("+08:00", "（台灣時間 +08:00）");

    function updateCountdown() {
      const nowMs = Date.now();
      const diffMs = endMs - nowMs;

      if (Number.isNaN(endMs) || diffMs <= 0) {
        const wasExpired = state.isCampaignExpired;
        state.isCampaignExpired = true;
        dom.cdDays.textContent = "00";
        dom.cdHours.textContent = "00";
        dom.cdMinutes.textContent = "00";
        dom.cdSeconds.textContent = "00";
        dom.campaignStatus.textContent = "本檔禮遇活動已結束";
        dom.campaignStatus.classList.add("is-expired");
        if (!wasExpired) {
          renderCart();
        }
        return;
      }

      state.isCampaignExpired = false;
      dom.campaignStatus.textContent = "限時禮遇進行中（台灣時間 +08:00）";
      dom.campaignStatus.classList.remove("is-expired");

      const totalSeconds = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      dom.cdDays.textContent = padTwo(days);
      dom.cdHours.textContent = padTwo(hours);
      dom.cdMinutes.textContent = padTwo(minutes);
      dom.cdSeconds.textContent = padTwo(seconds);
    }

    updateCountdown();
    window.setInterval(updateCountdown, 1000);

    dom.copyPromoBtn.addEventListener("click", async function () {
      if (state.isCampaignExpired) {
        dom.promoCopyFeedback.textContent = "此優惠碼活動已結束，仍歡迎選購日常精選禮品。";
        return;
      }
      const copied = await copyTextSafe(campaign.promoCode);
      if (copied) {
        dom.promoCopyFeedback.textContent = "已複製優惠碼「" + campaign.promoCode + "」，下方預購清單已可直接套用。";
        showToast("已複製優惠碼 " + campaign.promoCode);
      } else {
        dom.promoCopyFeedback.textContent = "無法自動複製，請手動輸入優惠碼：" + campaign.promoCode;
      }
    });
  }

  /* --------------------------------------------------------------------------
     商品分類篩選、即時搜尋與安全渲染（textContent）
     -------------------------------------------------------------------------- */
  function renderCategoryButtons() {
    dom.categoryFilters.textContent = "";
    DATA.categories.forEach(function (category) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-btn";
      btn.textContent = category;
      btn.setAttribute("aria-pressed", String(state.activeCategory === category));
      btn.addEventListener("click", function () {
        state.activeCategory = category;
        renderCategoryButtons();
        renderProducts();
      });
      dom.categoryFilters.appendChild(btn);
    });
  }

  function getFilteredProducts() {
    const keyword = state.searchQuery.trim().toLowerCase();
    return DATA.products.filter(function (product) {
      const matchCategory = state.activeCategory === "全部" || product.category === state.activeCategory;
      if (!matchCategory) return false;
      if (!keyword) return true;

      const searchable = [
        product.name,
        product.category,
        product.shortDesc,
        product.fullDesc,
        product.targetPet,
        product.safetyNote
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(keyword);
    });
  }

  function renderProducts() {
    const list = getFilteredProducts();
    dom.productGrid.textContent = "";

    const totalCount = DATA.products.length;
    if (list.length === 0) {
      dom.catalogStatus.textContent = "目前沒有符合條件的商品（共 " + totalCount + " 項選品）";
      dom.catalogEmpty.hidden = false;
      return;
    }

    dom.catalogEmpty.hidden = true;
    dom.catalogStatus.textContent = "顯示 " + list.length + " / " + totalCount + " 項安全精選商品";

    list.forEach(function (product) {
      const card = document.createElement("article");
      card.className = "product-card";

      const thumb = document.createElement("div");
      thumb.className = "product-thumb";
      const img = document.createElement("img");
      img.src = product.image;
      img.alt = product.alt;
      img.loading = "lazy";
      img.width = 600;
      img.height = 600;
      thumb.appendChild(img);

      const body = document.createElement("div");
      body.className = "product-body";

      const meta = document.createElement("div");
      meta.className = "product-meta";

      const tag = document.createElement("span");
      tag.className = "product-category-tag";
      tag.textContent = product.category;

      const price = document.createElement("span");
      price.className = "product-price";
      price.textContent = formatCurrency(product.price);

      meta.appendChild(tag);
      meta.appendChild(price);

      const title = document.createElement("h3");
      title.className = "product-title";
      title.textContent = product.name;

      const desc = document.createElement("p");
      desc.className = "product-short-desc";
      desc.textContent = product.shortDesc;

      const actions = document.createElement("div");
      actions.className = "product-actions";

      const detailBtn = document.createElement("button");
      detailBtn.type = "button";
      detailBtn.className = "btn btn-secondary";
      detailBtn.textContent = "查看詳情";
      detailBtn.addEventListener("click", function () {
        openProductModal(product.id, detailBtn);
      });

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn-primary";
      addBtn.textContent = "加入預購";
      addBtn.addEventListener("click", function () {
        addToCart(product.id);
      });

      actions.appendChild(detailBtn);
      actions.appendChild(addBtn);

      body.appendChild(meta);
      body.appendChild(title);
      body.appendChild(desc);
      body.appendChild(actions);

      card.appendChild(thumb);
      card.appendChild(body);
      dom.productGrid.appendChild(card);
    });
  }

  function initCatalogControls() {
    renderCategoryButtons();
    renderProducts();

    dom.productSearch.addEventListener("input", function () {
      state.searchQuery = dom.productSearch.value;
      dom.clearSearchBtn.hidden = state.searchQuery.length === 0;
      renderProducts();
    });

    dom.clearSearchBtn.addEventListener("click", function () {
      state.searchQuery = "";
      dom.productSearch.value = "";
      dom.clearSearchBtn.hidden = true;
      renderProducts();
      dom.productSearch.focus();
    });

    dom.resetFiltersBtn.addEventListener("click", function () {
      state.activeCategory = "全部";
      state.searchQuery = "";
      dom.productSearch.value = "";
      dom.clearSearchBtn.hidden = true;
      renderCategoryButtons();
      renderProducts();
    });
  }

  /* --------------------------------------------------------------------------
     商品詳情彈窗（Esc 鍵、背景點擊關閉與焦點復原）
     -------------------------------------------------------------------------- */
  function openProductModal(productId, triggerEl) {
    const product = findProductById(productId);
    if (!product) return;

    state.activeModalProductId = productId;
    state.lastFocusedElement = triggerEl || document.activeElement;

    dom.modalImage.src = product.image;
    dom.modalImage.alt = product.alt;
    dom.modalCategory.textContent = product.category;
    dom.modalTitle.textContent = product.name;
    dom.modalPrice.textContent = formatCurrency(product.price);
    dom.modalTarget.textContent = "適用對象：" + product.targetPet;
    dom.modalFullDesc.textContent = product.fullDesc;
    dom.modalSafetyNote.textContent = product.safetyNote;

    dom.modal.hidden = false;
    document.body.style.overflow = "hidden";
    dom.modalCloseX.focus();
  }

  function closeProductModal() {
    if (dom.modal.hidden) return;
    dom.modal.hidden = true;
    document.body.style.overflow = "";
    state.activeModalProductId = null;

    if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === "function") {
      state.lastFocusedElement.focus();
    }
    state.lastFocusedElement = null;
  }

  function initModal() {
    dom.modalCloseX.addEventListener("click", closeProductModal);
    dom.modalCloseBtn.addEventListener("click", closeProductModal);

    dom.modal.addEventListener("click", function (event) {
      if (event.target === dom.modal) {
        closeProductModal();
      }
    });

    dom.modalAddBtn.addEventListener("click", function () {
      if (state.activeModalProductId) {
        addToCart(state.activeModalProductId);
        closeProductModal();
      }
    });
  }

  /* --------------------------------------------------------------------------
     顧客評價與 FAQ（從 js/data.js 讀取、FAQ 支援鍵盤操作）
     -------------------------------------------------------------------------- */
  function renderReviews() {
    dom.reviewsGrid.textContent = "";
    DATA.reviews.forEach(function (rev) {
      const card = document.createElement("article");
      card.className = "review-card";

      const stars = document.createElement("div");
      stars.className = "review-stars";
      stars.setAttribute("aria-label", "五顆星好評");
      stars.textContent = rev.rating;

      const quote = document.createElement("p");
      quote.className = "review-quote";
      quote.textContent = "「" + rev.quote + "」";

      const footer = document.createElement("div");
      footer.className = "review-footer";

      const author = document.createElement("span");
      author.className = "review-author";
      author.textContent = rev.author;

      const context = document.createElement("span");
      context.className = "review-context";
      context.textContent = rev.context + " · " + rev.productName;

      footer.appendChild(author);
      footer.appendChild(context);

      card.appendChild(stars);
      card.appendChild(quote);
      card.appendChild(footer);
      dom.reviewsGrid.appendChild(card);
    });
  }

  function renderFaq() {
    dom.faqList.textContent = "";
    DATA.faqs.forEach(function (faq, index) {
      const item = document.createElement("div");
      item.className = "faq-item";

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "faq-trigger";
      const panelId = "faq-panel-" + faq.id;
      trigger.setAttribute("aria-expanded", index === 0 ? "true" : "false");
      trigger.setAttribute("aria-controls", panelId);

      const qText = document.createElement("span");
      qText.textContent = faq.question;

      const icon = document.createElement("span");
      icon.className = "faq-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "+";

      trigger.appendChild(qText);
      trigger.appendChild(icon);

      const panel = document.createElement("div");
      panel.className = "faq-panel";
      panel.id = panelId;
      panel.hidden = index !== 0;

      const answerP = document.createElement("p");
      answerP.textContent = faq.answer;
      panel.appendChild(answerP);

      trigger.addEventListener("click", function () {
        const isOpen = trigger.getAttribute("aria-expanded") === "true";
        trigger.setAttribute("aria-expanded", String(!isOpen));
        panel.hidden = isOpen;
      });

      item.appendChild(trigger);
      item.appendChild(panel);
      dom.faqList.appendChild(item);
    });
  }

  /* --------------------------------------------------------------------------
     預購清單、優惠折抵、驗證與 LINE/IG 明細匯出
     -------------------------------------------------------------------------- */
  function addToCart(productId) {
    const product = findProductById(productId);
    if (!product) return;

    const existing = state.cart.find(function (entry) {
      return entry.id === productId;
    });
    if (existing) {
      existing.qty += 1;
    } else {
      state.cart.push({ id: productId, qty: 1 });
    }
    saveCartToStorage();
    renderCart();
    clearPreorderFeedback();
    showToast("已加入預購：" + product.name);
  }

  function updateCartQty(productId, delta) {
    const idx = state.cart.findIndex(function (entry) {
      return entry.id === productId;
    });
    if (idx === -1) return;

    state.cart[idx].qty += delta;
    if (state.cart[idx].qty <= 0) {
      state.cart.splice(idx, 1);
    }
    saveCartToStorage();
    renderCart();
  }

  function removeFromCart(productId) {
    state.cart = state.cart.filter(function (entry) {
      return entry.id !== productId;
    });
    saveCartToStorage();
    renderCart();
  }

  function calculatePricing() {
    let subtotal = 0;
    let totalCount = 0;

    state.cart.forEach(function (entry) {
      const product = findProductById(entry.id);
      if (product) {
        subtotal += product.price * entry.qty;
        totalCount += entry.qty;
      }
    });

    const wantPromo = dom.applyPromoCheckbox.checked;
    const promoEligible = wantPromo && !state.isCampaignExpired && subtotal > 0;
    const finalTotal = promoEligible ? Math.round(subtotal * DATA.campaign.discountRate) : subtotal;
    const discountAmount = subtotal - finalTotal;

    return {
      totalCount: totalCount,
      subtotal: subtotal,
      discountAmount: discountAmount,
      finalTotal: finalTotal,
      promoApplied: promoEligible
    };
  }

  function buildOrderText() {
    const pricing = calculatePricing();
    const nickname = dom.customerNickname.value.trim() || "（尚未填寫聯絡暱稱）";
    const note = dom.customerNote.value.trim() || "無特別備註";
    const promoLabel = state.isCampaignExpired
      ? "活動已結束（以原價計算）"
      : pricing.promoApplied
        ? DATA.campaign.promoCode + "（" + DATA.campaign.discountText + "）"
        : "未使用優惠碼";

    const lines = [
      "【毛森禮研所 MoriPaw Atelier 預購清單】",
      "聯絡人暱稱：" + nickname,
      "--------------------------------",
      "預購品項："
    ];

    if (state.cart.length === 0) {
      lines.push("（尚未加入任何商品）");
    } else {
      state.cart.forEach(function (entry, idx) {
        const product = findProductById(entry.id);
        if (!product) return;
        const lineTotal = product.price * entry.qty;
        lines.push(
          (idx + 1) + ". " + product.name + " × " + entry.qty + "｜" + formatCurrency(lineTotal)
        );
      });
    }

    lines.push("--------------------------------");
    lines.push("商品小計：" + formatCurrency(pricing.subtotal));
    lines.push("優惠碼：" + promoLabel);
    lines.push("優惠折抵：- " + formatCurrency(pricing.discountAmount));
    lines.push("預估總金額：" + formatCurrency(pricing.finalTotal));
    lines.push("送禮／毛孩備註：" + note);
    lines.push("--------------------------------");
    lines.push("※ 請將此明細貼給官方 LINE（@moripaw.atelier）或 IG（@moripaw.atelier.tw），由專人確認現貨與賀卡細節。");

    return lines.join("\n");
  }

  function renderCart() {
    const pricing = calculatePricing();
    dom.navCartCount.textContent = String(pricing.totalCount);

    dom.cartList.textContent = "";
    const isEmpty = state.cart.length === 0;
    dom.cartEmpty.hidden = !isEmpty;
    dom.clearCartBtn.hidden = isEmpty;

    state.cart.forEach(function (entry) {
      const product = findProductById(entry.id);
      if (!product) return;

      const li = document.createElement("li");
      li.className = "cart-item";

      const infoRow = document.createElement("div");
      infoRow.className = "cart-item-info";

      const nameWrap = document.createElement("div");
      const nameEl = document.createElement("div");
      nameEl.className = "cart-item-name";
      nameEl.textContent = product.name;

      const unitEl = document.createElement("div");
      unitEl.className = "cart-item-unit";
      unitEl.textContent = "單價 " + formatCurrency(product.price);

      nameWrap.appendChild(nameEl);
      nameWrap.appendChild(unitEl);

      const lineTotalEl = document.createElement("div");
      lineTotalEl.className = "cart-item-subtotal";
      lineTotalEl.textContent = formatCurrency(product.price * entry.qty);

      infoRow.appendChild(nameWrap);
      infoRow.appendChild(lineTotalEl);

      const ctrlRow = document.createElement("div");
      ctrlRow.className = "cart-item-controls";

      const stepper = document.createElement("div");
      stepper.className = "qty-stepper";

      const minusBtn = document.createElement("button");
      minusBtn.type = "button";
      minusBtn.className = "qty-btn";
      minusBtn.textContent = "−";
      minusBtn.setAttribute("aria-label", "減少 " + product.name + " 數量");
      minusBtn.addEventListener("click", function () {
        updateCartQty(product.id, -1);
      });

      const qtyVal = document.createElement("span");
      qtyVal.className = "qty-value";
      qtyVal.textContent = String(entry.qty);

      const plusBtn = document.createElement("button");
      plusBtn.type = "button";
      plusBtn.className = "qty-btn";
      plusBtn.textContent = "+";
      plusBtn.setAttribute("aria-label", "增加 " + product.name + " 數量");
      plusBtn.addEventListener("click", function () {
        updateCartQty(product.id, 1);
      });

      stepper.appendChild(minusBtn);
      stepper.appendChild(qtyVal);
      stepper.appendChild(plusBtn);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-text-danger";
      removeBtn.textContent = "移除";
      removeBtn.setAttribute("aria-label", "移除 " + product.name);
      removeBtn.addEventListener("click", function () {
        removeFromCart(product.id);
      });

      ctrlRow.appendChild(stepper);
      ctrlRow.appendChild(removeBtn);

      li.appendChild(infoRow);
      li.appendChild(ctrlRow);
      dom.cartList.appendChild(li);
    });

    // 優惠狀態說明
    if (state.isCampaignExpired) {
      dom.applyPromoCheckbox.disabled = true;
      dom.cartPromoState.textContent = "目前限時禮遇活動已結束，優惠碼暫不適用，將以原價計算。";
    } else {
      dom.applyPromoCheckbox.disabled = false;
      dom.cartPromoState.textContent = dom.applyPromoCheckbox.checked
        ? "已套用優惠碼 " + DATA.campaign.promoCode + "。"
        : "未勾選套用優惠碼，將以原價計算。";
    }

    dom.summarySubtotal.textContent = formatCurrency(pricing.subtotal);
    dom.summaryDiscount.textContent = "- " + formatCurrency(pricing.discountAmount);
    dom.summaryTotal.textContent = formatCurrency(pricing.finalTotal);
    dom.orderPreviewText.textContent = buildOrderText();
  }

  function setPreorderFeedback(message, isError) {
    dom.preorderFeedback.textContent = message;
    dom.preorderFeedback.classList.remove("is-error", "is-success");
    if (message) {
      dom.preorderFeedback.classList.add(isError ? "is-error" : "is-success");
    }
  }

  function clearPreorderFeedback() {
    setPreorderFeedback("", false);
  }

  function validatePreorderBeforeExport() {
    if (state.cart.length === 0) {
      setPreorderFeedback("預購清單目前沒有商品，請先加入至少一項商品再匯出明細。", true);
      return false;
    }
    if (dom.customerNickname.value.trim() === "") {
      setPreorderFeedback("請填寫「聯絡人暱稱」，方便我們於 LINE 或 IG 回覆時稱呼您。", true);
      dom.customerNickname.focus();
      return false;
    }
    return true;
  }

  function initPreorder() {
    renderCart();

    dom.clearCartBtn.addEventListener("click", function () {
      state.cart = [];
      saveCartToStorage();
      renderCart();
      setPreorderFeedback("已清空預購清單。", false);
    });

    dom.applyPromoCheckbox.addEventListener("change", function () {
      renderCart();
    });

    dom.customerNickname.addEventListener("input", function () {
      clearPreorderFeedback();
      dom.orderPreviewText.textContent = buildOrderText();
    });

    dom.customerNote.addEventListener("input", function () {
      dom.orderPreviewText.textContent = buildOrderText();
    });

    dom.copyOrderBtn.addEventListener("click", async function () {
      if (!validatePreorderBeforeExport()) return;
      const text = buildOrderText();
      const copied = await copyTextSafe(text);
      if (copied) {
        setPreorderFeedback("預購明細已複製！歡迎直接貼到品牌 LINE 或 IG 小盒子。", false);
        showToast("已複製預購明細");
      } else {
        setPreorderFeedback("瀏覽器不支援自動複製，請直接複製下方預覽框內容。", true);
      }
    });

    dom.downloadOrderBtn.addEventListener("click", function () {
      if (!validatePreorderBeforeExport()) return;
      const text = buildOrderText();
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.href = url;
      a.download = "moripaw-preorder-" + today + ".txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPreorderFeedback("已下載純文字明細檔（.txt），可附檔或複製貼至 LINE / IG。", false);
      showToast("已下載預購明細 .txt");
    });
  }

  /* --------------------------------------------------------------------------
     全域鍵盤事件（Esc 關閉彈窗與手機選單）
     -------------------------------------------------------------------------- */
  function initGlobalKeyboard() {
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;

      if (!dom.modal.hidden) {
        closeProductModal();
        return;
      }

      if (dom.primaryNav.classList.contains("is-open")) {
        setNavOpen(false);
        dom.navToggle.focus();
      }
    });
  }

  /* --------------------------------------------------------------------------
     初始化啟動
     -------------------------------------------------------------------------- */
  function init() {
    initNavigation();
    initCampaign();
    initCatalogControls();
    initModal();
    renderReviews();
    renderFaq();
    initPreorder();
    initGlobalKeyboard();
  }

  init();
})();
