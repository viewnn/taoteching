// 兼容性 polyfill（部分旧版 webview 不支持 NodeList.forEach / Array.from）
if (!Array.prototype.forEach) {
    Array.prototype.forEach = function(fn, ctx) {
        for (var i = 0; i < this.length; i++) fn.call(ctx, this[i], i, this);
    };
}
if (typeof NodeList !== 'undefined' && NodeList.prototype && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
}
// 安全的 NodeList 遍历（避免 Array.from / forEach 兼容问题）
function $each(sel, fn) {
    var nl = document.querySelectorAll(sel);
    for (var i = 0; i < nl.length; i++) fn(nl[i], i);
}
// 全局变量
let bookData = [];
let currentIndex = 0;
let currentBook = "道德经";
const storageKey = "daoDeJingReadIndex";
const bookStorageKey = "daoDeJingBook";
let wbCache = null;
const bookDataCache = {};

const mask = document.getElementById("mask");
const catalogList = document.getElementById("catalogList");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const readWrap = document.getElementById("readWrap");
const bookSelect = document.getElementById("bookSelect");

// 读取本地阅读记录（按书分别存储）
function getProgressKey() {
    return storageKey + "_" + currentBook;
}
function loadProgress() {
    const save = localStorage.getItem(getProgressKey());
    if(save !== null){
        const idx = parseInt(save);
        if(!isNaN(idx) && idx >=0 && idx < bookData.length){
            currentIndex = idx;
        }
    }
}
function saveProgress(){
    localStorage.setItem(getProgressKey(), currentIndex);
}

// 渲染侧边目录（支持模糊搜索：匹配章节标题、原文、译文）
function renderCatalog(keyword){
    const kw = (keyword || "").trim().toLowerCase();
    catalogList.innerHTML = "";
    for(let i = 0; i < bookData.length; i++){
        const item = bookData[i];
        const haystack = (
            (item.chapter || "") + " " +
            (item.original || "") + " " +
            (item.translation || "")
        ).toLowerCase();
        if(kw && haystack.indexOf(kw) === -1) continue;
        let div = document.createElement("div");
        div.className = "catalog-item";
        div.innerText = item.chapter;
        div.onclick = (function(idx){
            return function(){
                switchChapter(idx);
                mask.classList.remove("show");
            };
        })(i);
        catalogList.appendChild(div);
    }
    if(kw && catalogList.children.length === 0){
        catalogList.innerHTML = '<div class="loading-tip">未找到匹配章节</div>';
    }
}

// 上下章按钮显隐控制
function updateNavBtn(){
    prevBtn.style.visibility = currentIndex <= 0 ? "hidden" : "visible";
    nextBtn.style.visibility = currentIndex >= bookData.length -1 ? "hidden" : "visible";
}

// 将文本按 xlsx 中的真实换行符 \n 同步换行展示
// 同时转义 HTML 特殊字符，避免数据中的 < > 被当作标签执行
function textToHtml(s){
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n/g, "<br>");
}

// 根据章节名查找索引（模糊匹配）
function findChapterIndex(name) {
    name = name.trim();
    if(!name) return -1;
    // 1. 先尝试精确匹配（保留括号内容，区分 3-1、3-2 等子节）
    for(let i = 0; i < bookData.length; i++){
        if(bookData[i].chapter === name) return i;
    }
    // 2. 纯数字匹配 no 列（如 linkchapter 写 "11"，对应 no=11 的章节）
    if(/^\d+$/.test(name)) {
        for(let i = 0; i < bookData.length; i++){
            if(String(bookData[i].no || "") === name) return i;
        }
    }
    // 3. 去掉括号中的序号进行模糊匹配
    //    比如 linkchapter 写 "第二章"，数据中是 "第二章（2）"
    const cleanName = name.replace(/（.*?）|\(.*?\)/g, "");
    for(let i = 0; i < bookData.length; i++){
        const ch = bookData[i].chapter.replace(/（.*?）|\(.*?\)/g, "");
        if(ch === cleanName) return i;
    }
    return -1;
}

// 渲染相关章节链接（按"、"、"，"分割，每段可独立点击跳转）
function renderLinkChapter(linkchapterStr) {
    const el = document.getElementById("link");
    if(!el) return;
    const str = (linkchapterStr || "").trim();
    if(!str) {
        el.innerHTML = '<span style="color:var(--text-sub);">暂无</span>';
        return;
    }
    const parts = str.split(/[、,，]/).map(function(s){ return s.trim(); }).filter(Boolean);
    const html = parts.map(function(name, i) {
        const idx = findChapterIndex(name);
        const sep = i > 0 ? '<span style="color:var(--text-sub);">、</span>' : '';
        if(idx >= 0) {
            return sep + '<a class="link-chapter" href="javascript:void(0)" onclick="goToChapter(' + idx + ')">' + name + '</a>';
        }
        return sep + '<span class="link-chapter" style="color:var(--text-sub);">' + name + '</span>';
    }).join('');
    el.innerHTML = html;
}

// 跳转到指定章节（供相关章节链接调用）
function goToChapter(idx){
    if(idx >= 0 && idx < bookData.length){
        switchChapter(idx);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// 切换章节渲染内容（适配你的json字段）
function switchChapter(index){
    currentIndex = index;
    saveProgress();
    const data = bookData[currentIndex];
    const typeEl = document.getElementById("chapterType");
    if(typeEl) typeEl.innerText = data.type || "";
    $each(".chap-title", function(el){ el.innerText = data.chapter; });
    document.querySelector(".yuanwen-text").innerHTML = textToHtml(data.original);
    document.querySelector(".zhushi-text").innerHTML = textToHtml(data.translation);
    document.querySelector(".zongjie-text").innerHTML = textToHtml(data.summary);
    renderLinkChapter(data.linkchapter);
    updateNavBtn();
}

prevBtn.onclick = () => {
    if(currentIndex > 0) switchChapter(currentIndex - 1);
}
nextBtn.onclick = () => {
    if(currentIndex < bookData.length - 1) switchChapter(currentIndex + 1);
}
// 书籍下拉切换
if(bookSelect){
    bookSelect.addEventListener("change", function(){
        switchBook(this.value);
    });
}

// 复制当前章节原文到剪贴板
const copyBtn = document.getElementById("copyBtn");
copyBtn.onclick = async () => {
    if(!bookData.length) return;
    const text = bookData[currentIndex].original || "";
    const originalLabel = copyBtn.innerText;
    try {
        await navigator.clipboard.writeText(text);
        copyBtn.innerText = "已复制";
    } catch (err) {
        // 兼容降级方案
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
            copyBtn.innerText = "已复制";
        } catch (e) {
            copyBtn.innerText = "复制失败";
        }
        document.body.removeChild(ta);
    }
    setTimeout(()=>{ copyBtn.innerText = originalLabel; }, 1500);
}

// 标签切换
$each(".tab-item", function(tab){
    tab.onclick = function(){
        $each(".tab-item", function(t){ t.classList.remove("active"); });
        this.classList.add("active");
        var viewId = this.dataset.view;
        $each(".view", function(v){ v.classList.remove("active"); });
        document.getElementById(viewId).classList.add("active");
    }
});

// 内容区域左右滑动切换tab（整个内容卡片区域均可滑动）
// 左滑 -> 切换到左边的tab(前一个)；右滑 -> 切换到右边的tab(后一个)
// 已在原文(最左)时无法左滑；已在总结(最右)时无法右滑
(function(){
    const swipeArea = document.querySelector('.content-card');
    if(!swipeArea) return;
    let startX = 0, startY = 0, startT = 0;
    const threshold = 50;      // 最小水平滑动距离(px)
    const maxDuration = 600;   // 滑动最大耗时(ms)
    swipeArea.addEventListener('touchstart', function(e){
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        startT = Date.now();
    }, { passive: true });
    swipeArea.addEventListener('touchend', function(e){
        if(Date.now() - startT > maxDuration) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if(Math.abs(dx) < threshold) return;            // 滑动距离不足
        if(Math.abs(dx) < Math.abs(dy)) return;         // 垂直滑动为主，避免影响上下滚动
        const tabs = document.querySelectorAll('.tab-item');
        let idx = -1;
        for(let i = 0; i < tabs.length; i++){
            if(tabs[i].classList.contains('active')){ idx = i; break; }
        }
        if(idx < 0) return;
        if(dx < 0){
            // 左滑 -> 左边tab(前一个)
            if(idx > 0) tabs[idx - 1].click();
        } else {
            // 右滑 -> 右边tab(后一个)
            if(idx < tabs.length - 1) tabs[idx + 1].click();
        }
    }, { passive: true });
})();

// 日夜切换
function toggleTheme(){
    if(document.body.dataset.theme === "dark"){
        delete document.body.dataset.theme;
    }else{
        document.body.dataset.theme = "dark";
    }
}

// 目录弹窗
const catalogSearch = document.getElementById("catalogSearch");
document.getElementById("openCatalog").onclick = ()=>{
    mask.classList.add("show");
    catalogSearch.value = "";
    renderCatalog("");
    catalogList.scrollTop = 0;
};
document.getElementById("closeCatalog").onclick = ()=>mask.classList.remove("show");
mask.onclick = (e)=>{
    if(e.target === mask) mask.classList.remove("show");
};
// 目录弹窗：打开时锁定背景滚动，关闭时恢复
(function(){
    const lockBody = function(locked){
        document.body.style.overflow = locked ? 'hidden' : '';
    };
    const _openCatalog = document.getElementById("openCatalog").onclick;
    document.getElementById("openCatalog").onclick = function(){
        _openCatalog.call(this);
        lockBody(true);
    };
    const _closeCatalog = document.getElementById("closeCatalog").onclick;
    document.getElementById("closeCatalog").onclick = function(){
        _closeCatalog.call(this);
        lockBody(false);
    };
    mask.addEventListener('click', function(e){
        if(e.target === mask) lockBody(false);
    });
})();
catalogSearch.addEventListener("input", ()=>{
    renderCatalog(catalogSearch.value);
});

// 监听 SW 缓存更新通知，提示用户刷新
if('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(e){
        if(e.data && e.data.type === 'cache-updated') {
            showUpdateTip();
        }
    });
}
// 页面加载完成后检查是否有新版本 SW 可用
if('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function(){
        if(!refreshing) {
            refreshing = true;
            location.reload();
        }
    });
}

// 显示"内容已更新"提示
function showUpdateTip() {
    if(document.getElementById('_updateTip')) return;
    const tip = document.createElement('div');
    tip.id = '_updateTip';
    tip.innerHTML = '内容已更新，<span id="_updateTipBtn" style="cursor:pointer;text-decoration:underline;">点击刷新</span>';
    tip.style.cssText = 'position:fixed;top:0;left:0;right:0;background:var(--accent,#8c2222);color:#fff;text-align:center;padding:10px;font-size:14px;z-index:9999;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
    document.body.appendChild(tip);
    tip.addEventListener('click', function(){
        tip.remove();
        location.reload();
    });
}

// 解析单个sheet为统一的bookData结构
function parseSheet(wb, sheetName) {
    const ws = wb.Sheets[sheetName];
    if(!ws) return [];
    const rawArr = XLSX.utils.sheet_to_json(ws, { defval: "" });
    // 过滤空行、空白章节
    let data = rawArr.filter(item => {
        const ch = String(item.chapter || "");
        return ch.trim() !== "";
    });
    // 确保所有字段存在（缺失时补空字符串）
    data = data.map(item => ({
        no: String(item.no || ""),
        chapter: String(item.chapter || ""),
        original: String(item.original || ""),
        translation: String(item.translation || ""),
        summary: String(item.summary || ""),
        type: String(item.type || ""),
        linkchapter: String(item.linkchapter || ""),
    }));
    return data;
}

// 加载指定书籍的数据（带缓存）
function loadBookData(bookName) {
    if(!wbCache) return;
    if(bookDataCache[bookName]) {
        bookData = bookDataCache[bookName];
        return;
    }
    bookDataCache[bookName] = parseSheet(wbCache, bookName);
    bookData = bookDataCache[bookName];
}

// 切换书籍
function switchBook(bookName) {
    if(!wbCache || wbCache.SheetNames.indexOf(bookName) < 0) return;
    if(bookName === currentBook) return;
    currentBook = bookName;
    localStorage.setItem(bookStorageKey, currentBook);
    currentIndex = 0;
    loadBookData(currentBook);
    // 切换书籍后重置目录搜索框
    if(catalogSearch) catalogSearch.value = "";
    loadProgress();
    renderCatalog();
    switchChapter(currentIndex);
}

// 加载外部book.xlsx 核心接入逻辑
async function loadBookJson() {
    try {
        // 加时间戳绕过 SW 缓存，确保每次刷新都能获取最新 xlsx 数据
        const res = await fetch("./book.xlsx?_=" + Date.now());
        if (!res.ok) throw new Error("xlsx文件读取失败，请检查文件路径");
        const buf = await res.arrayBuffer();
        wbCache = XLSX.read(new Uint8Array(buf), { type: "array" });
        // 填充书籍下拉选项
        if(bookSelect){
            bookSelect.innerHTML = "";
            wbCache.SheetNames.forEach(function(name){
                const opt = document.createElement("option");
                opt.value = name;
                opt.textContent = name;
                bookSelect.appendChild(opt);
            });
            // 恢复上次选择的书籍
            const savedBook = localStorage.getItem(bookStorageKey);
            if(savedBook && wbCache.SheetNames.indexOf(savedBook) >= 0) {
                currentBook = savedBook;
            } else {
                currentBook = wbCache.SheetNames[0] || currentBook;
            }
            bookSelect.value = currentBook;
        }
        // 加载当前书籍数据
        loadBookData(currentBook);
        // 清除加载提示
        readWrap.innerHTML = `
            <div class="view active" id="yuanwen">
                <div class="chap-title"></div>
                <div class="yuanwen-text"></div>
            </div>
            <div class="view" id="zhushi">
                <div class="chap-title"></div>
                <div class="zhushi-text"></div>
            </div>
            <div class="view" id="zongjie">
                <div class="chap-title"></div>
                <div class="zongjie-text"></div>
            </div>
        `;
        // 初始化页面
        loadProgress();
        renderCatalog();
        switchChapter(currentIndex);
    } catch (err) {
        readWrap.innerHTML = `<div class="loading-tip" style="color:#c33">数据加载失败：${err.message}<br>请确保html与book.xlsx放在同一文件夹，且SheetJS库已正常加载</div>`;
        console.error("XLSX加载错误：", err);
    }
}

// 页面启动加载xlsx
loadBookJson();
